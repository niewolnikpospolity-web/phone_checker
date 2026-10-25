const usbCheckButton = document.querySelector("#usb-check-button");
const usbMessage = document.querySelector("#usb-message");
const terminalTool = document.querySelector("#terminal-tool");
const terminalDevice = document.querySelector("#terminal-device");
const terminalOutput = document.querySelector("#terminal-output");
const terminalManualForm = document.querySelector("#terminal-manual-form");
const terminalManualInput = document.querySelector("#terminal-manual-input");
const terminalManualRun = document.querySelector("#terminal-manual-run");
const apkFileSelect = document.querySelector("#apk-file-select");
const apkInstallButton = document.querySelector("#apk-install-button");
const apkPathHint = document.querySelector("#apk-path-hint");
const flashPartition = document.querySelector("#flash-partition");
const flashImageSelect = document.querySelector("#flash-image-select");
const flashImageButton = document.querySelector("#flash-image-button");
const flashImageHint = document.querySelector("#flash-image-hint");
const settingsDialog = document.querySelector("#settings-dialog");
const refreshIntervalSelect = document.querySelector("#refresh-interval");
const colorThemeSelect = document.querySelector("#color-theme");
const layoutDensitySelect = document.querySelector("#layout-density");
const reduceMotionInput = document.querySelector("#reduce-motion");
const showTemperaturesInput = document.querySelector("#show-temperatures");
const showRecommendationsInput = document.querySelector("#show-recommendations");
const toast = document.querySelector("#toast");
let toastTimeout;
let refreshTimer = null;
let refreshInProgress = false;
let terminalDevices = { adb: [], fastboot: [] };
let flashImages = [];
let apkFiles = [];
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
let refreshInterval = readPreference("pocketcare-refresh-interval", "60", ["0", "15", "30", "60", "120", "300", "600"]);
let colorTheme = readPreference("pocketcare-color-theme", "mint", ["mint", "blue", "violet", "amber"]);
let layoutDensity = readPreference("pocketcare-layout-density", "comfortable", ["comfortable", "compact"]);
let reduceMotion = readPreference("pocketcare-reduce-motion", "false", ["true", "false"]) === "true";
let showTemperatures = readPreference("pocketcare-show-temperatures", "true", ["true", "false"]) === "true";
let showRecommendations = readPreference("pocketcare-show-recommendations", "true", ["true", "false"]) === "true";

loadSavedSettings();
applyVisualSettings();
configureRefresh();

document.querySelector("#settings-button").addEventListener("click", () => {
  loadSavedSettings();
  settingsDialog.showModal();
});
document.querySelector("#settings-close").addEventListener("click", closeSettings);
document.querySelector("#settings-cancel").addEventListener("click", closeSettings);
settingsDialog.addEventListener("click", (event) => {
  if (event.target === settingsDialog) closeSettings();
});
settingsDialog.addEventListener("cancel", () => {
  loadSavedSettings();
  applyVisualSettings();
});
[
  colorThemeSelect,
  layoutDensitySelect,
  reduceMotionInput,
  showTemperaturesInput,
  showRecommendationsInput,
].forEach((control) => {
  control.addEventListener("change", applyVisualSettings);
});
document.querySelector("#settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  refreshInterval = refreshIntervalSelect.value;
  colorTheme = colorThemeSelect.value;
  layoutDensity = layoutDensitySelect.value;
  reduceMotion = reduceMotionInput.checked;
  showTemperatures = showTemperaturesInput.checked;
  showRecommendations = showRecommendationsInput.checked;
  localStorage.setItem("pocketcare-refresh-interval", refreshInterval);
  localStorage.setItem("pocketcare-color-theme", colorTheme);
  localStorage.setItem("pocketcare-layout-density", layoutDensity);
  localStorage.setItem("pocketcare-reduce-motion", String(reduceMotion));
  localStorage.setItem("pocketcare-show-temperatures", String(showTemperatures));
  localStorage.setItem("pocketcare-show-recommendations", String(showRecommendations));
  applyVisualSettings();
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
apkFileSelect.addEventListener("change", updateTerminalOptions);
apkInstallButton.addEventListener("click", installApkFromComputer);
flashImageSelect.addEventListener("change", updateTerminalOptions);
flashPartition.addEventListener("change", updateTerminalOptions);
flashImageButton.addEventListener("click", flashLocalImage);
terminalManualForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runTerminalCommand();
});
updateTerminalOptions();

function readPreference(key, fallback, allowedValues) {
  const value = localStorage.getItem(key);
  return allowedValues.includes(value) ? value : fallback;
}

function loadSavedSettings() {
  refreshIntervalSelect.value = refreshInterval;
  colorThemeSelect.value = colorTheme;
  layoutDensitySelect.value = layoutDensity;
  reduceMotionInput.checked = reduceMotion;
  showTemperaturesInput.checked = showTemperatures;
  showRecommendationsInput.checked = showRecommendations;
}

function applyVisualSettings() {
  document.body.dataset.theme = colorThemeSelect.value;
  document.body.dataset.density = layoutDensitySelect.value;
  document.documentElement.dataset.motion = reduceMotionInput.checked ? "reduced" : "full";
  document.body.dataset.motion = document.documentElement.dataset.motion;
  document.body.dataset.temperatures = showTemperaturesInput.checked ? "visible" : "hidden";
  document.body.dataset.recommendations = showRecommendationsInput.checked ? "visible" : "hidden";
}

function closeSettings() {
  loadSavedSettings();
  applyVisualSettings();
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
      renderPhoneData(androidDevice);
    } else if (fastbootFound) {
      renderFastbootInfo(result.fastboot.devices.find((device) => device.info));
    } else if (adbFound) {
      resetPhoneInfo("Authorize this computer on your phone to read device info.");
    } else {
      resetPhoneInfo("Demo metrics · Check USB devices for live Android info");
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
    setPhoneDataUnavailable("Device checker unavailable");
  } finally {
    refreshInProgress = false;
    usbCheckButton.disabled = false;
    usbCheckButton.innerHTML = "<span>⌕</span> Check USB devices";
  }
}

checkUsbDevices(true);
loadFlashFiles();
loadApkFiles();

function updateTerminalDevices(result) {
  terminalDevices = {
    adb: result.adb?.devices?.filter((device) => device.status === "device") || [],
    fastboot: result.fastboot?.devices || [],
  };
  updateTerminalOptions();
}

function updateTerminalOptions(respectTypedPrefix = true) {
  const typedPrefix = respectTypedPrefix
    ? terminalManualInput.value.trim().match(/^(adb|fastboot)\s+/i)
    : null;
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
  apkInstallButton.disabled = !terminalDevices.adb.length || !apkFileSelect.value;
  flashImageButton.disabled = !terminalDevices.fastboot.length || !flashImageSelect.value;
  terminalManualInput.setAttribute(
    "aria-invalid",
    terminalManualInput.value.trim() && !typedCommand ? "true" : "false",
  );
}

async function loadFlashFiles() {
  try {
    const response = await fetch("/api/flash-files");
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || `Could not load flash_files (HTTP ${response.status}).`);
    }
    if (!Array.isArray(result.files)) {
      throw new Error("Phone Checker returned an invalid flash_files listing.");
    }
    flashImages = result.files.filter(
      (file) => typeof file.name === "string" && /\.img$/i.test(file.name),
    );
    flashImageSelect.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = flashImages.length
      ? "Choose an image from flash_files"
      : "No .img files in flash_files";
    flashImageSelect.append(placeholder);
    flashImages.forEach((file) => {
      const option = document.createElement("option");
      option.value = file.name;
      option.textContent = file.name;
      flashImageSelect.append(option);
    });
    flashImageSelect.disabled = flashImages.length === 0;
    updateTerminalOptions();
  } catch (error) {
    flashImageSelect.replaceChildren();
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Could not load flash_files";
    flashImageSelect.append(option);
    flashImageSelect.disabled = true;
    flashImageHint.textContent = error instanceof TypeError
      ? "Could not reach Phone Checker while loading flash_files."
      : error.message;
    updateTerminalOptions();
  }
}

async function loadApkFiles() {
  try {
    const response = await fetch("/api/apk-files");
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || `Could not load apk_files (HTTP ${response.status}).`);
    }
    if (!Array.isArray(result.files)) {
      throw new Error("Phone Checker returned an invalid apk_files listing.");
    }
    apkFiles = result.files.filter(
      (file) => typeof file.name === "string" && /\.apk$/i.test(file.name),
    );
    apkFileSelect.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = apkFiles.length
      ? "Choose an APK from apk_files"
      : "No APK files in apk_files";
    apkFileSelect.append(placeholder);
    apkFiles.forEach((file) => {
      const option = document.createElement("option");
      option.value = file.name;
      option.textContent = file.name;
      apkFileSelect.append(option);
    });
    apkFileSelect.disabled = apkFiles.length === 0;
    updateTerminalOptions();
  } catch (error) {
    apkFileSelect.replaceChildren();
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Could not load apk_files";
    apkFileSelect.append(option);
    apkFileSelect.disabled = true;
    apkPathHint.textContent = error instanceof TypeError
      ? "Could not reach Phone Checker while loading apk_files."
      : error.message;
    updateTerminalOptions();
  }
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
    terminalOutput.textContent = "Fastboot accepts supported read-only and reboot commands. Use the flash helper for boot or recovery images.";
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

async function installApkFromComputer() {
  const apkName = apkFileSelect.value;
  if (!apkFiles.some((file) => file.name === apkName)) {
    terminalOutput.textContent = "Choose an APK listed from the apk_files folder.";
    return;
  }
  terminalTool.value = "adb";
  updateTerminalOptions(false);
  const serial = terminalDevice.value;
  if (!serial || !terminalDevices.adb.some((device) => device.serial === serial)) {
    terminalOutput.textContent = "Select an authorized ADB device first.";
    return;
  }
  const confirmed = window.confirm(
    `Install ${apkName} from apk_files on ${serial}?\n\nThis installs software on the selected phone. Only install APKs from a source you trust.`,
  );
  if (!confirmed) {
    terminalOutput.textContent = "APK installation cancelled.";
    return;
  }

  apkInstallButton.disabled = true;
  terminalManualRun.disabled = true;
  terminalTool.disabled = true;
  terminalDevice.disabled = true;
  apkFileSelect.disabled = true;
  terminalOutput.textContent = `Installing ${apkName}… Keep the phone connected.`;
  try {
    const response = await fetch("/api/terminal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: "adb",
        command: "install_apk",
        apkName,
        serial,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || `APK installation failed (HTTP ${response.status}).`);
    }
    terminalOutput.textContent = result.output || `ADB finished installing ${apkName}.`;
  } catch (error) {
    terminalOutput.textContent = error instanceof TypeError
      ? "Could not reach Phone Checker. Start the app with: python app_server.py"
      : error.message;
  } finally {
    terminalTool.disabled = false;
    apkFileSelect.disabled = apkFiles.length === 0;
    updateTerminalOptions();
  }
}

async function flashLocalImage() {
  const imageName = flashImageSelect.value;
  if (!flashImages.some((file) => file.name === imageName)) {
    terminalOutput.textContent = "Choose an image listed from the flash_files folder.";
    return;
  }
  const partition = flashPartition.value;
  terminalTool.value = "fastboot";
  updateTerminalOptions(false);
  const serial = terminalDevice.value;
  if (!serial || !terminalDevices.fastboot.some((device) => device.serial === serial)) {
    terminalOutput.textContent = "Select a connected Fastboot device first.";
    return;
  }
  const confirmed = window.confirm(
    `Flash ${imageName} from flash_files to the ${partition} partition on ${serial}?\n\nThis writes to the device and an incompatible image can make the phone unbootable. Confirm that this image is specifically for your exact device. No erase command will be run.`,
  );
  if (!confirmed) {
    terminalOutput.textContent = "Flash cancelled.";
    return;
  }

  flashImageButton.disabled = true;
  terminalManualRun.disabled = true;
  terminalTool.disabled = true;
  terminalDevice.disabled = true;
  flashPartition.disabled = true;
  flashImageSelect.disabled = true;
  terminalOutput.textContent = `Flashing ${partition} image… Do not disconnect the phone.`;
  try {
    const response = await fetch("/api/terminal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: "fastboot",
        command: `flash_${partition}`,
        imageName,
        serial,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || `Flash failed (HTTP ${response.status}).`);
    }
    terminalOutput.textContent = result.output || `Fastboot finished flashing ${partition}.`;
  } catch (error) {
    terminalOutput.textContent = error instanceof TypeError
      ? "Could not reach Phone Checker. Start the app with: python app_server.py"
      : error.message;
  } finally {
    terminalTool.disabled = false;
    flashPartition.disabled = false;
    flashImageSelect.disabled = flashImages.length === 0;
    updateTerminalOptions();
  }
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
    document.querySelector("#storage-used").textContent = info.storage.usedGB;
    document.querySelector("#storage-total").textContent = info.storage.totalGB;
    document.querySelector("#storage-meter").style.width = `${info.storage.percent}%`;
    document.querySelector("#storage-caption").textContent = `${info.storage.percent}% used · internal storage`;
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
    "ⓘ Live values are read-only Android status from the connected phone.";
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
  setPhoneDetail(
    "storage-used",
    info.storage ? `${info.storage.usedGB} GB · ${info.storage.availableGB} GB available` : "",
  );
  setPhoneDetail("storage-total", info.storage ? `${info.storage.totalGB} GB` : "");
  setPhoneDetail("storage-percent", info.storage ? `${info.storage.percent}%` : "");
  setPhoneDetail("storage-partition", info.storage ? "Internal storage" : "");
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

function renderFastbootInfo(device) {
  resetPhoneInfo("Phone is in Fastboot mode. Android battery, storage, and temperature are unavailable here.");
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
