const profileSelect = document.querySelector("#profile-select");
const profileCaption = document.querySelector("#profile-caption");
const profileApplyButton = document.querySelector("#profile-apply-button");
const usbCheckButton = document.querySelector("#usb-check-button");
const usbMessage = document.querySelector("#usb-message");
const terminalTool = document.querySelector("#terminal-tool");
const terminalDevice = document.querySelector("#terminal-device");
const terminalOutput = document.querySelector("#terminal-output");
const terminalManualForm = document.querySelector("#terminal-manual-form");
const terminalManualInput = document.querySelector("#terminal-manual-input");
const terminalManualRun = document.querySelector("#terminal-manual-run");
const apkPathInput = document.querySelector("#apk-path-input");
const apkInstallButton = document.querySelector("#apk-install-button");
const settingsDialog = document.querySelector("#settings-dialog");
const refreshIntervalSelect = document.querySelector("#refresh-interval");
const colorThemeSelect = document.querySelector("#color-theme");
const toast = document.querySelector("#toast");
let toastTimeout;
let connectedDeviceSerial = null;
let currentBatterySaver = null;
let refreshTimer = null;
let refreshInProgress = false;
let terminalDevices = { adb: [], fastboot: [] };
const terminalCommands = {
  adb: [
    { id: "manufacturer", label: "Read manufacturer", command: "shell getprop ro.product.manufacturer" },
    { id: "model", label: "Read model", command: "shell getprop ro.product.model" },
    { id: "device", label: "Read device codename", command: "shell getprop ro.product.device" },
    { id: "android_version", label: "Read Android version", command: "shell getprop ro.build.version.release" },
    { id: "api_level", label: "Read Android API level", command: "shell getprop ro.build.version.sdk" },
    { id: "build_id", label: "Read build ID", command: "shell getprop ro.build.id" },
    { id: "security_patch", label: "Read security patch date", command: "shell getprop ro.build.version.security_patch" },
    { id: "battery", label: "Read battery status", command: "shell dumpsys battery" },
    { id: "storage", label: "Read data storage", command: "shell df -h /data" },
    { id: "thermal", label: "Read thermal service status", command: "shell dumpsys thermalservice" },
    { id: "memory", label: "Read memory summary", command: "shell cat /proc/meminfo" },
    { id: "uptime", label: "Read system uptime", command: "shell uptime" },
    { id: "power_saver", label: "Read Battery Saver setting", command: "shell settings get global low_power" },
    { id: "reboot", label: "Reboot Android", command: "reboot", changesState: true },
  ],
  fastboot: [
    { id: "product", label: "Read product", command: "getvar product" },
    { id: "version", label: "Read Fastboot version", command: "getvar version" },
    { id: "is_userspace", label: "Check fastbootd", command: "getvar is-userspace" },
    { id: "devices", label: "List Fastboot devices", command: "devices", needsDevice: false },
    { id: "reboot", label: "Reboot phone", command: "reboot", changesState: true },
  ],
};
let refreshInterval = readPreference("pocketcare-refresh-interval", "60", ["0", "30", "60", "300"]);
let colorTheme = readPreference("pocketcare-color-theme", "mint", ["mint", "blue", "violet", "amber"]);

document.body.dataset.theme = colorTheme;
refreshIntervalSelect.value = refreshInterval;
colorThemeSelect.value = colorTheme;
configureRefresh();

profileSelect.addEventListener("change", () => {
  profileCaption.textContent = profileSelect.value === "Battery saver"
    ? "Reduces background activity to extend battery life"
    : "Turns Android Battery Saver off";
});
profileApplyButton.addEventListener("click", applySelectedProfile);
document.querySelector("#settings-button").addEventListener("click", () => {
  refreshIntervalSelect.value = refreshInterval;
  colorThemeSelect.value = colorTheme;
  settingsDialog.showModal();
});
document.querySelector("#settings-close").addEventListener("click", closeSettings);
document.querySelector("#settings-cancel").addEventListener("click", closeSettings);
settingsDialog.addEventListener("click", (event) => {
  if (event.target === settingsDialog) closeSettings();
});
settingsDialog.addEventListener("cancel", () => {
  document.body.dataset.theme = colorTheme;
});
colorThemeSelect.addEventListener("change", () => {
  document.body.dataset.theme = colorThemeSelect.value;
});
document.querySelector("#settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  refreshInterval = refreshIntervalSelect.value;
  colorTheme = colorThemeSelect.value;
  localStorage.setItem("pocketcare-refresh-interval", refreshInterval);
  localStorage.setItem("pocketcare-color-theme", colorTheme);
  document.body.dataset.theme = colorTheme;
  configureRefresh();
  settingsDialog.close();
  showToast("Settings saved.");
});

document.querySelectorAll(".tip-button").forEach((button) => {
  button.addEventListener("click", () => showToast(button.dataset.tip));
});

usbCheckButton.addEventListener("click", checkUsbDevices);
terminalTool.addEventListener("change", () => {
  updateTerminalOptions();
  terminalOutput.textContent = "Connection changed. Enter a supported command.";
});
terminalDevice.addEventListener("change", updateTerminalOptions);
terminalManualInput.addEventListener("input", updateTerminalOptions);
apkPathInput.addEventListener("input", updateTerminalOptions);
apkInstallButton.addEventListener("click", installApkFromComputer);
terminalManualForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runTerminalCommand();
});
updateTerminalOptions();

function readPreference(key, fallback, allowedValues) {
  const value = localStorage.getItem(key);
  return allowedValues.includes(value) ? value : fallback;
}

function closeSettings() {
  document.body.dataset.theme = colorTheme;
  settingsDialog.close();
}

function configureRefresh() {
  window.clearInterval(refreshTimer);
  refreshTimer = null;
  if (refreshInterval !== "0") {
    refreshTimer = window.setInterval(() => checkUsbDevices(true), Number(refreshInterval) * 1000);
  }
}

async function checkUsbDevices(automatic = false) {
  if (refreshInProgress) return;
  refreshInProgress = true;
  usbCheckButton.disabled = true;
  if (!automatic) usbCheckButton.innerHTML = "<span>…</span> Checking devices";
  usbMessage.textContent = automatic
    ? "Refreshing connected device data…"
    : "Checking connected devices with ADB and Fastboot…";

  try {
    const response = await fetch("/api/devices");
    if (!response.ok) {
      throw new Error(`Device check failed (HTTP ${response.status}).`);
    }
    const result = await response.json();
    updateTerminalDevices(result);
    const adbFound = renderToolResult("adb-result", result.adb, "ADB");
    const fastbootFound = renderToolResult("fastboot-result", result.fastboot, "Fastboot");
    const foundCount = adbFound + fastbootFound;
    const androidDevice = result.adb.devices.find(
      (device) => device.status === "device" && device.info,
    );
    if (androidDevice) {
      renderAndroidInfo(androidDevice);
      connectedDeviceSerial = androidDevice.serial;
      currentBatterySaver = androidDevice.info.batterySaver;
      profileApplyButton.disabled = false;
      renderPhoneData(androidDevice);
      const saverRequested = androidDevice.info.batterySaverRequested;
      if (currentBatterySaver !== null && saverRequested !== null) {
        profileSelect.value = saverRequested ? "Battery saver" : "Balanced";
        if (saverRequested && !currentBatterySaver && androidDevice.info.battery?.pluggedIn) {
          profileCaption.textContent = "Requested · unplug the phone to activate Battery Saver";
        } else {
          profileCaption.textContent = currentBatterySaver
            ? "Battery Saver is currently on"
            : "Battery Saver is currently off";
        }
      } else {
        profileCaption.textContent = "Power mode status unavailable";
      }
    } else if (fastbootFound) {
      renderFastbootInfo(result.fastboot.devices.find((device) => device.info));
      disablePowerProfile("Return to Android and connect with ADB to change power mode.");
    } else if (adbFound) {
      resetPhoneInfo("Authorize this computer on your phone to read device info.");
      disablePowerProfile("Authorize this computer on your phone to change power mode.");
    } else {
      resetPhoneInfo("Demo metrics · Check USB devices for live Android info");
      disablePowerProfile("Connect an authorized Android phone through ADB to change power mode.");
    }
    if (!androidDevice && !fastbootFound && adbFound) {
      document.querySelector("#connection-status").textContent = "USB authorization needed";
    } else if (!androidDevice && !fastbootFound) {
      document.querySelector("#connection-status").textContent = "No live connection";
    }

    if (foundCount) {
      usbMessage.textContent = `${foundCount} device${foundCount === 1 ? "" : "s"} detected.`;
    } else if (!result.adb.available && !result.fastboot.available) {
      usbMessage.textContent = "ADB and Fastboot were not found. Install Android Platform Tools, then restart this app.";
    } else if (result.adb.error || result.fastboot.error) {
      usbMessage.textContent = "One or more checks failed. See the details below.";
    } else {
      usbMessage.textContent = "No devices detected. Check the USB cable and mode, then try again.";
    }
    document.querySelector("#data-updated").textContent = "Updated just now";
  } catch (error) {
    usbMessage.textContent = error instanceof TypeError
      ? "Could not reach the local device checker. Start the app with: python app_server.py"
      : error.message;
    updateTerminalDevices({ adb: { devices: [] }, fastboot: { devices: [] } });
    setToolUnavailable("adb-result", "Checker unavailable");
    setToolUnavailable("fastboot-result", "Checker unavailable");
    disablePowerProfile("Device checker unavailable.");
    setPhoneDataUnavailable("Device checker unavailable");
  } finally {
    refreshInProgress = false;
    usbCheckButton.disabled = false;
    usbCheckButton.innerHTML = "<span>⌕</span> Check USB devices";
  }
}

checkUsbDevices(true);

function updateTerminalDevices(result) {
  terminalDevices = {
    adb: result.adb?.devices?.filter((device) => device.status === "device") || [],
    fastboot: result.fastboot?.devices || [],
  };
  updateTerminalOptions();
}

function updateTerminalOptions() {
  const typedPrefix = terminalManualInput.value.trim().match(/^(adb|fastboot)\s+/i);
  if (typedPrefix && terminalTool.value !== typedPrefix[1].toLowerCase()) {
    terminalTool.value = typedPrefix[1].toLowerCase();
    updateTerminalOptions();
    return;
  }
  const tool = terminalTool.value;
  const devices = terminalDevices[tool];
  const previousSerial = terminalDevice.value;
  terminalDevice.replaceChildren();
  devices.forEach((device) => {
    const option = document.createElement("option");
    option.value = device.serial;
    option.textContent = [device.model, device.serial].filter(Boolean).join(" · ");
    terminalDevice.append(option);
  });
  if (devices.some((device) => device.serial === previousSerial)) {
    terminalDevice.value = previousSerial;
  }
  terminalDevice.disabled = devices.length === 0;
  if (!devices.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = tool === "adb" ? "No authorized ADB device" : "No Fastboot device";
    terminalDevice.append(option);
  }

  const typedCommand = resolveManualCommand(tool, terminalManualInput.value);
  terminalManualRun.disabled = !typedCommand ||
    (typedCommand.needsDevice !== false && !devices.length);
  apkInstallButton.disabled = !terminalDevices.adb.length || !apkPathInput.value.trim();
  terminalManualInput.setAttribute(
    "aria-invalid",
    terminalManualInput.value.trim() && !typedCommand ? "true" : "false",
  );
}

function resolveManualCommand(tool, input) {
  const normalized = input.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > 8192 || normalized.includes("\0")) return null;
  const prefix = normalized.match(/^(adb|fastboot)(?:\s+-s\s+(\S+))?\s+/i);
  const commandTool = prefix ? prefix[1].toLowerCase() : tool;
  if (prefix?.[2] && prefix[2] !== terminalDevice.value) return null;
  const commandText = prefix ? normalized.slice(prefix[0].length) : normalized;
  if (!commandText) return null;
  if (commandTool === "adb") {
    const command = terminalCommands.adb.find((item) => item.command === commandText);
    return {
      ...(command || {}),
      tool: commandTool,
      commandText,
      needsDevice: true,
      changesState: command?.changesState || false,
      requiresConfirmation: !command,
    };
  }
  const command = terminalCommands.fastboot.find((item) => item.command === commandText);
  return command ? { ...command, tool: commandTool } : null;
}

async function runTerminalCommand() {
  const selected = resolveManualCommand(terminalTool.value, terminalManualInput.value);
  if (!selected) {
    terminalOutput.textContent = "Fastboot accepts only its supported read-only and reboot commands.";
    return;
  }
  const tool = selected.tool || terminalTool.value;
  if (
    (selected.changesState || selected.requiresConfirmation) &&
    !window.confirm(
      selected.changesState
        ? `Reboot the selected ${tool === "adb" ? "Android phone" : "Fastboot device"} now?`
        : `Run this ADB command on the selected phone?\n\n${terminalManualInput.value}\n\nADB commands can modify device settings or data.`,
    )
  ) {
    terminalOutput.textContent = "Command cancelled.";
    return;
  }
  const serial = selected.needsDevice === false ? null : terminalDevice.value;
  terminalManualRun.disabled = true;
  terminalOutput.textContent = selected.changesState ? "Rebooting device…" : "Running command…";
  try {
    const response = await fetch("/api/terminal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool,
        command: tool === "adb" ? null : selected.id,
        manualCommand: terminalManualInput.value,
        serial: serial || null,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || `Command failed (HTTP ${response.status}).`);
    }
    terminalOutput.textContent = result.output || "(Command completed with no output.)";
  } catch (error) {
    terminalOutput.textContent = error instanceof TypeError
      ? "Could not reach Phone Checker. Start the app with: python app_server.py"
      : error.message;
  } finally {
    updateTerminalOptions();
  }
}

function installApkFromComputer() {
  const path = apkPathInput.value.trim().replace(/^"(.*)"$/, "$1");
  if (!path || /["\0\r\n]/.test(path)) {
    terminalOutput.textContent = "Enter a valid Windows path to an APK file.";
    apkPathInput.focus();
    return;
  }
  if (!/\.apk$/i.test(path)) {
    terminalOutput.textContent = "The selected file path must end in .apk.";
    apkPathInput.focus();
    return;
  }
  terminalTool.value = "adb";
  terminalManualInput.value = `install "${path}"`;
  updateTerminalOptions();
  runTerminalCommand();
}

function renderToolResult(elementId, result, toolName) {
  const element = document.querySelector(`#${elementId}`);
  const state = element.querySelector(".tool-state");
  const list = element.querySelector(".device-list");
  list.replaceChildren();

  if (!result.available) {
    element.dataset.state = "missing";
    state.textContent = `${toolName} not found`;
    appendDeviceRow(list, `Install Android Platform Tools to use ${toolName}.`, "");
    return 0;
  }

  if (result.error) {
    element.dataset.state = "error";
    state.textContent = "Check failed";
    appendDeviceRow(list, result.error, "");
    return 0;
  }

  element.dataset.state = "ready";
  const devices = result.devices;
  state.textContent = devices.length
    ? `${devices.length} found`
    : "No devices";

  devices.forEach((device) => {
    const details = [device.serial, device.model].filter(Boolean).join(" · ");
    const row = appendDeviceRow(list, details, device.status, device.status);
    if (device.info) {
      const infoText = toolName === "ADB"
        ? formatAndroidInfo(device.info)
        : formatFastbootInfo(device.info);
      if (infoText) {
        const info = document.createElement("span");
        info.className = "device-details";
        info.textContent = infoText;
        row.append(info);
      }
    }
  });
  return devices.length;
}

function appendDeviceRow(list, label, status, statusAttribute = "") {
  const row = document.createElement("li");
  row.className = "device-row";
  row.textContent = label;
  if (statusAttribute) {
    row.dataset.status = statusAttribute;
  }
  if (status) {
    const statusLabel = document.createElement("span");
    statusLabel.className = "device-status";
    statusLabel.textContent = status;
    row.append(statusLabel);
  }
  list.append(row);
  return row;
}

function formatAndroidInfo(info) {
  const parts = [
    [info.manufacturer, info.model].filter(Boolean).join(" "),
    info.androidVersion ? `Android ${info.androidVersion}` : "",
  ].filter(Boolean);
  if (info.battery?.status) parts.push(info.battery.status);
  return parts.join(" · ");
}

function formatFastbootInfo(info) {
  return [
    info.product ? `Product ${info.product}` : "",
    info.version ? `Fastboot ${info.version}` : "",
    info["is-userspace"] ? `Userspace ${info["is-userspace"]}` : "",
  ].filter(Boolean).join(" · ");
}

function renderAndroidInfo(device) {
  const info = device.info;
  document.querySelector("#connection-status").textContent = "Connected via ADB";
  const name = [info.manufacturer, info.model].filter(Boolean).join(" ").trim();
  document.querySelector("#phone-name").textContent = name || device.model || "Connected Android phone";
  document.querySelector("#phone-subtitle").textContent = [
    info.androidVersion ? `Android ${info.androidVersion}` : "",
    device.serial,
  ].filter(Boolean).join(" · ");

  if (info.battery?.level !== undefined) {
    document.querySelector("#battery-reading").textContent = info.battery.level;
    document.querySelector("#battery-meter").style.width = `${info.battery.level}%`;
    document.querySelector("#battery-caption").textContent = [
      info.battery.status,
      info.battery.health ? `Health: ${info.battery.health}` : "",
    ].filter(Boolean).join(" · ") || "Live ADB reading";
  } else {
    document.querySelector("#battery-caption").textContent = info.batteryError || "Battery data unavailable";
  }

  if (info.storage) {
    document.querySelector("#storage-used").textContent = info.storage.usedGb;
    document.querySelector("#storage-total").textContent = info.storage.totalGb;
    document.querySelector("#storage-meter").style.width = `${info.storage.percent}%`;
    document.querySelector("#storage-caption").textContent = `${info.storage.percent}% used · /data`;
  } else {
    document.querySelector("#storage-caption").textContent = info.storageError || "Storage data unavailable";
  }

  if (info.battery?.temperatureC !== undefined) {
    document.querySelector("#temperature-reading").textContent = info.battery.temperatureC;
    document.querySelector("#temperature-status").textContent = info.battery.health || "Live ADB reading";
    document.querySelector("#temperature-caption").textContent = "Battery temperature · Live ADB reading";
  } else {
    document.querySelector("#temperature-caption").textContent = "Battery temperature unavailable";
  }
  document.querySelector("#device-footnote").textContent =
    "ⓘ Live values are read-only Android status from the connected phone. Profile choices do not change device settings.";
}

function renderPhoneData(device) {
  const info = device.info;
  setPhoneDetail("manufacturer", info.manufacturer);
  setPhoneDetail("model", info.model || device.model);
  setPhoneDetail("device", info.device);
  setPhoneDetail("serial", device.serial);
  setPhoneDetail("android", info.androidVersion ? `Android ${info.androidVersion}` : "");
  setPhoneDetail("build", info.buildId);
  setPhoneDetail("security", info.securityPatch);
  setPhoneDetail("api", info.sdkVersion);
  setPhoneDetail("charge", info.battery?.level === undefined ? "" : `${info.battery.level}%`);
  setPhoneDetail("charging", info.battery?.status);
  setPhoneDetail("health", info.battery?.health);
  setPhoneDetail(
    "temperature",
    info.battery?.temperatureC === undefined ? "" : `${info.battery.temperatureC} °C`,
  );
  setPhoneDetail(
    "saver",
    info.batterySaver === null
      ? "Unavailable"
      : info.batterySaver
        ? "On"
        : info.batterySaverRequested && info.battery?.pluggedIn
          ? "Requested · unplug to activate"
          : "Off",
  );
  setPhoneDetail("storage-used", info.storage ? `${info.storage.usedGb} GB` : "");
  setPhoneDetail("storage-total", info.storage ? `${info.storage.totalGb} GB` : "");
  setPhoneDetail("storage-percent", info.storage ? `${info.storage.percent}%` : "");
  setPhoneDetail("storage-partition", info.storage ? "/data" : "");
  renderTemperatures(info);
  document.querySelector("#data-updated").textContent = "Updated just now";
}

function renderTemperatures(info) {
  const sensors = info.temperatures || [];
  const temperatureFor = (category) => sensors
    .filter((sensor) => sensor.category === category)
    .sort((left, right) => right.temperatureC - left.temperatureC);
  const battery = info.battery?.temperatureC;
  const cpu = temperatureFor("cpu");
  const gpu = temperatureFor("gpu");
  const other = [...temperatureFor("soc"), ...temperatureFor("skin")]
    .sort((left, right) => right.temperatureC - left.temperatureC);

  document.querySelector("#sensor-battery").textContent =
    battery === undefined ? "Unavailable" : `${battery} °C`;
  document.querySelector("#sensor-cpu").textContent =
    cpu.length ? `${cpu[0].temperatureC} °C` : "Unavailable";
  document.querySelector("#sensor-cpu-description").textContent =
    cpu.length ? `Hottest of ${cpu.length} CPU sensors` : "CPU sensor not exposed";
  document.querySelector("#sensor-gpu").textContent =
    gpu.length ? `${gpu[0].temperatureC} °C` : "Unavailable";
  document.querySelector("#sensor-gpu-description").textContent =
    gpu.length ? `Hottest of ${gpu.length} GPU sensors` : "GPU sensor not exposed";
  document.querySelector("#sensor-other").textContent =
    other.length ? `${other[0].temperatureC} °C` : "Unavailable";
  document.querySelector("#sensor-other-description").textContent =
    other.length ? `${other[0].category.toUpperCase()} sensor` : "No SoC or skin sensor exposed";
  document.querySelector("#temperature-source").textContent =
    sensors.length || battery !== undefined ? "Live ADB readings" : "Sensors unavailable";

  const list = document.querySelector("#temperature-sensor-list");
  list.replaceChildren();
  cpu.forEach((sensor) => {
    const row = document.createElement("li");
    const name = document.createElement("span");
    const value = document.createElement("strong");
    name.textContent = sensor.name;
    value.textContent = `${sensor.temperatureC} °C`;
    row.append(name, value);
    list.append(row);
  });
}

function setPhoneDetail(name, value) {
  document.querySelector(`#detail-${name}`).textContent = value || "Unavailable";
}

async function applySelectedProfile() {
  if (!connectedDeviceSerial) {
    showToast("Check for an authorized ADB device before applying a power profile.");
    return;
  }

  const profile = profileSelect.value;
  const action = profile === "Battery saver"
    ? "Turn on Android Battery Saver?"
    : "Turn off Android Battery Saver and return to normal power mode?";
  if (!window.confirm(`${action}\n\nThis changes the connected phone’s system power setting.`)) {
    return;
  }

  profileApplyButton.disabled = true;
  profileApplyButton.textContent = "Applying…";
  profileCaption.textContent = "Applying the Android power setting…";
  try {
    const response = await fetch("/api/power-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serial: connectedDeviceSerial, profile }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || `Could not apply profile (HTTP ${response.status}).`);
    }
    currentBatterySaver = result.batterySaver;
    profileSelect.value = result.requested ? "Battery saver" : result.profile;
    if (result.pending) {
      profileCaption.textContent = "Requested · unplug the phone to activate Battery Saver";
      setPhoneDetail("saver", "Requested · unplug to activate");
      showToast(result.message);
    } else {
      profileCaption.textContent = currentBatterySaver
        ? "Battery Saver is on"
        : "Battery Saver is off · Normal power mode";
      setPhoneDetail("saver", currentBatterySaver ? "On" : "Off");
      showToast(`Updated ${result.profile} on the connected phone.`);
    }
  } catch (error) {
    profileCaption.textContent = "Power mode was not confirmed";
    showToast(error instanceof TypeError
      ? "Could not reach the local phone checker. Restart Phone Checker and try again."
      : error.message);
  } finally {
    profileApplyButton.disabled = !connectedDeviceSerial;
    profileApplyButton.textContent = "Apply to phone";
  }
}

function disablePowerProfile(message) {
  connectedDeviceSerial = null;
  currentBatterySaver = null;
  profileApplyButton.disabled = true;
  profileCaption.textContent = message;
}

function renderFastbootInfo(device) {
  resetPhoneInfo("Phone is in Fastboot mode. Android battery, storage, and temperature are unavailable here.");
  disablePowerProfile("Fastboot does not expose Android’s Battery Saver control.");
  document.querySelector("#connection-status").textContent = "Fastboot mode";
  if (device?.info) {
    const details = formatFastbootInfo(device.info);
    if (details) {
      document.querySelector("#phone-name").textContent = "Fastboot device";
      document.querySelector("#phone-subtitle").textContent = details;
    }
  }
  setPhoneDataUnavailable("Android data unavailable in Fastboot mode");
}

function resetPhoneInfo(subtitle) {
  document.querySelector("#connection-status").textContent = "Demo status";
  document.querySelector("#phone-name").textContent = "My phone";
  document.querySelector("#phone-subtitle").textContent = subtitle;
  document.querySelector("#battery-reading").textContent = "—";
  document.querySelector("#battery-meter").style.width = "0";
  document.querySelector("#battery-caption").textContent = "No live ADB reading";
  document.querySelector("#storage-used").textContent = "—";
  document.querySelector("#storage-total").textContent = "—";
  document.querySelector("#storage-meter").style.width = "0";
  document.querySelector("#storage-caption").textContent = "No live ADB reading";
  document.querySelector("#temperature-reading").textContent = "—";
  document.querySelector("#temperature-status").textContent = "Unavailable";
  document.querySelector("#temperature-caption").textContent = "No live ADB reading";
  document.querySelector("#device-footnote").textContent =
    "ⓘ Live metrics require an authorized Android phone in ADB mode. Fastboot mode exposes bootloader details only.";
  setPhoneDataUnavailable("Connect a phone to load details");
  disablePowerProfile("Connect an authorized Android phone through ADB to change power mode.");
}

function setPhoneDataUnavailable(message) {
  document.querySelectorAll(".data-list dd").forEach((detail) => {
    detail.textContent = "Unavailable";
  });
  ["battery", "cpu", "gpu", "other"].forEach((sensor) => {
    document.querySelector(`#sensor-${sensor}`).textContent = "Unavailable";
  });
  document.querySelector("#sensor-cpu-description").textContent = "CPU sensor";
  document.querySelector("#sensor-gpu-description").textContent = "GPU sensor";
  document.querySelector("#sensor-other-description").textContent = "Additional thermal sensors";
  document.querySelector("#temperature-source").textContent = message;
  document.querySelector("#temperature-sensor-list").replaceChildren();
  document.querySelector("#data-updated").textContent = message;
}

function setToolUnavailable(elementId, message) {
  const element = document.querySelector(`#${elementId}`);
  element.dataset.state = "error";
  element.querySelector(".tool-state").textContent = message;
  element.querySelector(".device-list").replaceChildren();
}

function showToast(message) {
  window.clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimeout = window.setTimeout(() => toast.classList.remove("visible"), 3600);
}
