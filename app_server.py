import json
import re
import shlex
import shutil
import subprocess
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
TIMEOUT_SECONDS = 5
MAX_MANUAL_ADB_COMMAND_LENGTH = 8192
SAFE_SERIAL = re.compile(r"^[A-Za-z0-9._:-]+$")
class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path == "/api/devices":
            self.send_device_results()
            return
        super().do_GET()

    def do_POST(self):
        if self.path == "/api/terminal":
            self.run_terminal_command()
            return
        if self.path != "/api/power-profile":
            self.send_json(404, {"error": "Not found."})
            return
        if self.headers.get("Origin") not in (
            "http://127.0.0.1:8000",
            "http://localhost:8000",
        ):
            self.send_json(403, {"error": "Requests must come from the local Phone Checker page."})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_json(400, {"error": "Invalid request length."})
            return
        if content_length <= 0 or content_length > 2048:
            self.send_json(400, {"error": "Invalid request size."})
            return
        if self.headers.get_content_type() != "application/json":
            self.send_json(415, {"error": "Send a JSON request."})
            return

        try:
            payload = json.loads(self.rfile.read(content_length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.send_json(400, {"error": "Invalid JSON request."})
            return
        if not isinstance(payload, dict):
            self.send_json(400, {"error": "Invalid request."})
            return

        serial = payload.get("serial")
        profile = payload.get("profile")
        if not isinstance(serial, str) or not SAFE_SERIAL.fullmatch(serial):
            self.send_json(400, {"error": "Invalid device serial."})
            return
        if profile not in ("Balanced", "Battery saver"):
            self.send_json(400, {"error": "Choose Balanced or Battery saver."})
            return

        result, status = apply_power_profile(serial, profile)
        self.send_json(status, result)

    def run_terminal_command(self):
        if self.headers.get("Origin") not in (
            "http://127.0.0.1:8000",
            "http://localhost:8000",
        ):
            self.send_json(403, {"error": "Requests must come from the local Phone Checker page."})
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_json(400, {"error": "Invalid request length."})
            return
        if content_length <= 0 or content_length > 65536:
            self.send_json(400, {"error": "Invalid request size."})
            return
        if self.headers.get_content_type() != "application/json":
            self.send_json(415, {"error": "Send a JSON request."})
            return
        try:
            payload = json.loads(self.rfile.read(content_length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.send_json(400, {"error": "Invalid JSON request."})
            return
        if not isinstance(payload, dict):
            self.send_json(400, {"error": "Invalid request."})
            return

        tool = payload.get("tool")
        command = payload.get("command")
        manual_command = payload.get("manualCommand")
        serial = payload.get("serial")
        result, status = execute_terminal_command(tool, command, serial, manual_command)
        self.send_json(status, result)

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_device_results(self):
        result = {
            "adb": inspect_devices("adb", ["devices", "-l"]),
            "fastboot": inspect_devices("fastboot", ["devices"]),
        }
        body = json.dumps(result).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def apply_power_profile(serial, profile):
    executable = shutil.which("adb")
    if executable is None:
        return {"error": "ADB was not found. Install Android Platform Tools and restart Phone Checker."}, 503

    output, error = run_tool(executable, ["devices"])
    if error:
        return {"error": f"Could not check connected ADB devices: {error}"}, 502
    connected = {
        device["serial"]
        for device in parse_adb_devices(output or "")
        if device["status"] == "device"
    }
    if serial not in connected:
        return {"error": "That phone is not currently connected and authorized through ADB."}, 409

    mode = "1" if profile == "Battery saver" else "0"
    _, error = run_tool(
        executable, ["-s", serial, "shell", "settings", "put", "global", "low_power", mode]
    )
    if error:
        return {"error": f"Android could not apply {profile}: {error}"}, 502

    output, error = run_tool(
        executable, ["-s", serial, "shell", "settings", "get", "global", "low_power"]
    )
    if error:
        return {"error": f"Android accepted the request, but could not verify it: {error}"}, 502
    requested = (output or "").strip() == mode
    if not requested:
        return {"error": "Android did not save the requested Battery Saver setting."}, 502

    output, error = run_tool(executable, ["-s", serial, "shell", "dumpsys", "power"])
    if error:
        return {"error": f"Could not verify the active power mode: {error}"}, 502
    battery_saver = parse_power_saver_state(output or "")
    if battery_saver is None:
        return {
            "error": "Android did not report its Battery Saver state. Check the phone’s Battery settings."
        }, 502
    expected = mode == "1"
    if battery_saver != expected:
        battery_output, battery_error = run_tool(
            executable, ["-s", serial, "shell", "dumpsys", "battery"]
        )
        battery = parse_battery_info(battery_output or "") if not battery_error else {}
        if expected and battery.get("pluggedIn"):
            return {
                "profile": profile,
                "batterySaver": battery_saver,
                "requested": True,
                "pending": True,
                "message": "Android saved the request but will only activate Battery Saver after the phone is unplugged.",
            }, 202
        return {
            "error": (
                f"Android did not switch Battery Saver {'on' if expected else 'off'}. "
                "Check the phone’s Battery settings and try again."
            )
        }, 502
    return {"profile": profile, "batterySaver": battery_saver}, 200


def inspect_devices(tool, arguments):
    executable = shutil.which(tool)
    if executable is None:
        return {"available": False, "devices": [], "error": None}

    try:
        completed = subprocess.run(
            [executable, *arguments],
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SECONDS,
            check=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except subprocess.TimeoutExpired:
        return {
            "available": True,
            "devices": [],
            "error": f"{tool} did not respond within {TIMEOUT_SECONDS} seconds.",
        }
    except OSError as error:
        return {"available": True, "devices": [], "error": str(error)}

    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout).strip()
        return {
            "available": True,
            "devices": [],
            "error": detail or f"{tool} exited with code {completed.returncode}.",
        }

    output = completed.stdout
    devices = parse_adb_devices(output) if tool == "adb" else parse_fastboot_devices(output)
    if tool == "adb":
        for device in devices:
            if device["status"] == "device" and SAFE_SERIAL.fullmatch(device["serial"]):
                device["info"] = inspect_android_device(executable, device["serial"])
    elif tool == "fastboot":
        for device in devices:
            if SAFE_SERIAL.fullmatch(device["serial"]):
                device["info"] = inspect_fastboot_device(executable, device["serial"])
    return {"available": True, "devices": devices, "error": None}


def read_power_saver_request(executable, serial):
    output, error = run_tool(
        executable, ["-s", serial, "shell", "settings", "get", "global", "low_power"]
    )
    if error or (output or "").strip() not in ("0", "1"):
        return None
    return output.strip() == "1"


def run_tool(executable, arguments):
    try:
        completed = subprocess.run(
            [executable, *arguments],
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SECONDS,
            check=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except subprocess.TimeoutExpired:
        return None, f"Command did not respond within {TIMEOUT_SECONDS} seconds."
    except OSError as error:
        return None, str(error)

    output = "\n".join(part for part in (completed.stdout, completed.stderr) if part)
    if completed.returncode != 0:
        return None, output.strip() or f"Command exited with code {completed.returncode}."
    return output.strip(), None


def execute_terminal_command(tool, command, serial, manual_command=None):
    if not isinstance(tool, str):
        return {"error": "Choose ADB or Fastboot."}, 400
    command_map = {
        "adb": {
            "manufacturer": ["shell", "getprop", "ro.product.manufacturer"],
            "model": ["shell", "getprop", "ro.product.model"],
            "device": ["shell", "getprop", "ro.product.device"],
            "android_version": ["shell", "getprop", "ro.build.version.release"],
            "api_level": ["shell", "getprop", "ro.build.version.sdk"],
            "build_id": ["shell", "getprop", "ro.build.id"],
            "security_patch": ["shell", "getprop", "ro.build.version.security_patch"],
            "battery": ["shell", "dumpsys", "battery"],
            "storage": ["shell", "df", "-h", "/data"],
            "thermal": ["shell", "dumpsys", "thermalservice"],
            "memory": ["shell", "cat", "/proc/meminfo"],
            "uptime": ["shell", "uptime"],
            "power_saver": ["shell", "settings", "get", "global", "low_power"],
            "reboot": ["reboot"],
        },
        "fastboot": {
            "product": ["getvar", "product"],
            "version": ["getvar", "version"],
            "is_userspace": ["getvar", "is-userspace"],
            "reboot": ["reboot"],
        },
    }
    if tool not in command_map:
        return {"error": "Choose ADB or Fastboot."}, 400
    manual_arguments = None
    if manual_command is not None:
        if not isinstance(manual_command, str) or "\0" in manual_command:
            return {"error": "Enter a valid manual command."}, 400
        max_length = MAX_MANUAL_ADB_COMMAND_LENGTH if tool == "adb" else 256
        if len(manual_command) > max_length:
            return {"error": f"Manual commands must be no longer than {max_length} characters."}, 400
        normalized = manual_command.strip()
        prefix_match = re.match(r"^(adb|fastboot)(?:\s+-s\s+(\S+))?\s+", normalized, re.IGNORECASE)
        if prefix_match:
            if prefix_match.group(1).lower() != tool:
                return {"error": "The command prefix does not match the selected connection type."}, 400
            typed_serial = prefix_match.group(2)
            if typed_serial and typed_serial != serial:
                return {"error": "The command serial does not match the selected device."}, 400
            normalized = normalized[prefix_match.end():]
        if tool == "adb":
            try:
                manual_arguments = parse_manual_adb_command(normalized)
            except ValueError as error:
                return {"error": str(error)}, 400
            command = next(
                (
                    command_id
                    for command_id, arguments in command_map[tool].items()
                    if manual_arguments == arguments
                ),
                "manual",
            )
        else:
            normalized = " ".join(normalized.split())
            command = next(
                (
                    command_id
                    for command_id, arguments in command_map[tool].items()
                    if normalized == " ".join(arguments)
                ),
                "devices" if normalized == "devices" else None,
            )
    elif not isinstance(command, str):
        return {"error": "Choose a listed ADB or Fastboot command."}, 400

    if tool == "fastboot" and command == "devices" and serial is None:
        arguments = ["devices"]
        requires_device = False
    elif tool == "adb" and manual_arguments is not None:
        arguments = manual_arguments
        requires_device = True
    elif tool in command_map and command in command_map[tool]:
        arguments = command_map[tool][command]
        requires_device = True
    else:
        return {
            "error": "Command not recognized. Enter a listed command, optionally prefixed with adb or fastboot and the selected device’s serial."
        }, 400

    executable = shutil.which(tool)
    if executable is None:
        return {"error": f"{tool} was not found. Install Android Platform Tools and restart Phone Checker."}, 503

    if requires_device:
        if not isinstance(serial, str) or not SAFE_SERIAL.fullmatch(serial):
            return {"error": "Select a connected device first."}, 400
        device_output, error = run_tool(executable, ["devices"])
        if error:
            return {"error": f"Could not check connected {tool} devices: {error}"}, 502
        if tool == "adb":
            connected = {
                device["serial"]
                for device in parse_adb_devices(device_output or "")
                if device["status"] == "device"
            }
        else:
            connected = {
                device["serial"]
                for device in parse_fastboot_devices(device_output or "")
            }
        if serial not in connected:
            return {"error": f"That device is no longer connected through {tool}."}, 409
        arguments = ["-s", serial, *arguments]

    output, error = run_tool(executable, arguments)
    if error:
        return {"error": error}, 502
    return {
        "tool": tool,
        "command": command,
        "output": (output or "")[:16000],
        "reboot": command == "reboot",
    }, 200


def parse_manual_adb_command(command_text):
    if not command_text:
        raise ValueError("Enter an ADB command.")

    shell_match = re.match(r"^shell\s+(.+)$", command_text, re.IGNORECASE | re.DOTALL)
    if shell_match:
        remote_command = shell_match.group(1).strip()
        try:
            tokens = shlex.split(remote_command, posix=False)
        except ValueError as error:
            raise ValueError("Check the quoting in the ADB shell command.") from error
        if len(tokens) == 1:
            remote_command = strip_manual_quotes(tokens[0])
        if not remote_command:
            raise ValueError("Enter an ADB shell command.")
        return ["shell", remote_command]

    try:
        tokens = shlex.split(command_text, posix=False)
    except ValueError as error:
        raise ValueError("Check the quoting in the ADB command.") from error
    arguments = [strip_manual_quotes(token) for token in tokens]
    if not arguments:
        raise ValueError("Enter an ADB command.")
    return arguments


def strip_manual_quotes(value):
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        return value[1:-1]
    return value


def inspect_android_device(executable, serial):
    def read_property(property_name):
        output, error = run_tool(
            executable,
            ["-s", serial, "shell", "getprop", property_name],
        )
        return output if output and not error else ""

    info = {
        "manufacturer": read_property("ro.product.manufacturer"),
        "model": read_property("ro.product.model"),
        "device": read_property("ro.product.device"),
        "androidVersion": read_property("ro.build.version.release"),
        "buildId": read_property("ro.build.display.id"),
        "securityPatch": read_property("ro.build.version.security_patch"),
        "sdkVersion": read_property("ro.build.version.sdk"),
        "battery": None,
        "temperatures": [],
        "storage": None,
        "batterySaver": None,
        "batterySaverRequested": None,
    }

    battery_output, battery_error = run_tool(
        executable, ["-s", serial, "shell", "dumpsys", "battery"]
    )
    if battery_output and not battery_error:
        info["battery"] = parse_battery_info(battery_output)
    else:
        info["batteryError"] = battery_error

    thermal_output, thermal_error = run_tool(
        executable,
        [
            "-s", serial, "shell",
            'for z in /sys/class/thermal/thermal_zone*; do type=$(cat "$z/type" 2>/dev/null); temp=$(cat "$z/temp" 2>/dev/null); echo "$type $temp"; done',
        ],
    )
    if thermal_output and not thermal_error:
        info["temperatures"] = parse_thermal_zones(thermal_output)
    elif thermal_error:
        info["temperatureError"] = thermal_error

    storage_output, storage_error = run_tool(
        executable, ["-s", serial, "shell", "df", "-k", "/data"]
    )
    if storage_output and not storage_error:
        info["storage"] = parse_storage_info(storage_output)
    else:
        info["storageError"] = storage_error

    power_output, power_error = run_tool(
        executable, ["-s", serial, "shell", "dumpsys", "power"]
    )
    if power_output and not power_error:
        info["batterySaver"] = parse_power_saver_state(power_output)
    info["batterySaverRequested"] = read_power_saver_request(executable, serial)
    return info


def parse_battery_info(output):
    values = {}
    plugged_in = False
    for line in output.splitlines():
        match = re.match(r"\s*(level|temperature|status|health):\s*(-?\d+)", line)
        if match:
            values[match.group(1)] = int(match.group(2))
        if re.match(r"\s*(?:AC|USB|Wireless|Dock) powered:\s*true\b", line, re.IGNORECASE):
            plugged_in = True

    result = {"pluggedIn": plugged_in}
    level = values.get("level")
    if level is not None and 0 <= level <= 100:
        result["level"] = level
    temperature = values.get("temperature")
    if temperature is not None:
        result["temperatureC"] = round(temperature / 10, 1)
    if "status" in values:
        result["status"] = {
            1: "Unknown", 2: "Charging", 3: "Discharging",
            4: "Not charging", 5: "Full",
        }.get(values["status"], "Unknown")
    if "health" in values:
        result["health"] = {
            1: "Unknown", 2: "Good", 3: "Overheat", 4: "Dead",
            5: "Over voltage", 6: "Unspecified failure", 7: "Cold",
        }.get(values["health"], "Unknown")
    return result


def parse_power_saver_state(output):
    match = re.search(
        r"Battery saver state machine:\s*Enabled=(true|false)\b",
        output,
        re.IGNORECASE,
    )
    return match.group(1).lower() == "true" if match else None


def parse_thermal_zones(output):
    sensors = []
    categories = (
        ("cpu", re.compile(r"(?:cpu|cpuss)", re.IGNORECASE)),
        ("gpu", re.compile(r"(?:gpu|gpuss)", re.IGNORECASE)),
        ("soc", re.compile(r"(?:^soc|soc[_-]|[_-]soc)", re.IGNORECASE)),
        ("skin", re.compile(r"skin", re.IGNORECASE)),
    )
    for line in output.splitlines():
        fields = line.rsplit(maxsplit=1)
        if len(fields) != 2:
            continue
        name, raw_temperature = fields
        if not re.fullmatch(r"-?\d+", raw_temperature):
            continue
        milli_celsius = int(raw_temperature)
        if not -40000 <= milli_celsius <= 150000:
            continue
        for category, pattern in categories:
            if pattern.search(name):
                sensors.append({
                    "name": name,
                    "category": category,
                    "temperatureC": round(milli_celsius / 1000, 1),
                })
                break
    return sensors


def parse_storage_info(output):
    for line in reversed(output.splitlines()):
        fields = line.split()
        if len(fields) >= 6 and fields[1].isdigit() and fields[2].isdigit():
            total_kb = int(fields[1])
            used_kb = int(fields[2])
            if total_kb > 0:
                return {
                    "usedGb": round(used_kb / 1024 / 1024, 1),
                    "totalGb": round(total_kb / 1024 / 1024, 1),
                    "percent": min(100, round(used_kb * 100 / total_kb)),
                }
    return None


def inspect_fastboot_device(executable, serial):
    info = {}
    for variable in ("product", "version", "is-userspace"):
        output, error = run_tool(
            executable,
            ["-s", serial, "getvar", variable],
        )
        if output:
            match = re.search(
                rf"(?:\(bootloader\)\s*)?{re.escape(variable)}:\s*(\S+)",
                output,
            )
            if match:
                info[variable] = match.group(1)
        if error:
            info[f"{variable}Error"] = error
    return info


def parse_adb_devices(output):
    devices = []
    for line in output.splitlines():
        fields = line.split()
        if len(fields) < 2 or fields[0] == "List":
            continue
        device = {"serial": fields[0], "status": fields[1], "model": ""}
        for field in fields[2:]:
            if field.startswith("model:"):
                device["model"] = field.removeprefix("model:").replace("_", " ")
                break
        devices.append(device)
    return devices


def parse_fastboot_devices(output):
    devices = []
    for line in output.splitlines():
        fields = line.split()
        if not fields:
            continue
        devices.append({
            "serial": fields[0],
            "status": fields[1] if len(fields) > 1 else "fastboot",
            "model": "",
        })
    return devices


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8000), AppHandler)
    print("Phone Checker is running at http://127.0.0.1:8000")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Phone Checker.")
    finally:
        server.server_close()
