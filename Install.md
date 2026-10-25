# Install and Set Up Phone Checker

This guide installs the requirements and runs Phone Checker on Windows 10 or 11. The Python server uses only Python's standard-library modules; there are no third-party Python packages to install.

## Requirements

- Windows 10 or 11
- Python 3.9 or newer
- Android SDK Platform Tools for Windows (`adb.exe` and `fastboot.exe`)
- A modern web browser
- An Android phone and a USB data cable

### Python modules

The server imports these modules, all included with Python:

- `http.server` — local web server
- `json` — API request and response data
- `pathlib` — project and file paths
- `re` — input and device-serial validation
- `shlex` — parsing manual ADB commands
- `shutil` — locating ADB and Fastboot on `PATH`
- `subprocess` — running the Android Platform Tools

No `pip install` command is required. In particular, do not install packages from a requirements file; this project does not have external Python dependencies.

## 1. Install Python

Download Python for Windows from <https://www.python.org/downloads/windows/> and run the installer. Enable **Add python.exe to PATH**. Alternatively, install Python 3.12 with Windows Package Manager:

```powershell
winget install --id Python.Python.3.12 --exact
```

Open a new PowerShell window and confirm Python is available:

```powershell
python --version
```

The reported version must be 3.9 or newer. If `python` is not recognized, reopen PowerShell or repair the Python PATH setting.

## 2. Download and install Android Platform Tools

The following PowerShell commands download Google's official Windows Platform Tools ZIP and extract it to `C:\Android\platform-tools`:

```powershell
New-Item -ItemType Directory -Force -Path "C:\Android" | Out-Null
Invoke-WebRequest -Uri "https://dl.google.com/android/repository/platform-tools-latest-windows.zip" -OutFile "$env:TEMP\platform-tools.zip"
Expand-Archive -Path "$env:TEMP\platform-tools.zip" -DestinationPath "C:\Android" -Force
```

Add the extracted folder to your user PATH (this preserves existing PATH entries):

```powershell
$platformTools = "C:\Android\platform-tools"
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (($userPath -split ";") -notcontains $platformTools) {
    $newPath = if ([string]::IsNullOrWhiteSpace($userPath)) { $platformTools } else { "$userPath;$platformTools" }
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
}
```

Close and reopen PowerShell, then verify both tools:

```powershell
adb version
fastboot --version
```

If either command is not recognized, confirm that `C:\Android\platform-tools` contains `adb.exe` and `fastboot.exe`, then reopen the terminal after correcting PATH.

## 3. Connect an Android phone

1. On the phone, open **Settings → About phone** and tap **Build number** repeatedly to enable Developer options. The menu names can vary by manufacturer.
2. Open **Developer options** and enable **USB debugging**.
3. Connect the phone to the PC with a USB data cable and unlock it.
4. Accept the prompt to authorize USB debugging for this computer.
5. In PowerShell, check the connection:

   ```powershell
   adb devices
   ```

   The device should show the status `device`. If it shows `unauthorized`, unlock the phone and accept its prompt.

Fastboot is a separate bootloader mode. It is only available after rebooting the phone into its bootloader; check it with:

```powershell
fastboot devices
```

## 4. Start Phone Checker

Open PowerShell in the folder containing `app_server.py`. Replace the example path with the folder where you saved the project:

```powershell
Set-Location "C:\path\to\phone_checker"
python app_server.py
```

The server listens on this PC only at `127.0.0.1:8000`. Leave the PowerShell window open and browse to <http://127.0.0.1:8000/>. Stop the server with **Ctrl+C** in its PowerShell window.

No separate frontend build, Node.js installation, Python virtual environment, or package-install command is needed.

## 5. Add APK files (optional)

Copy trusted `.apk` files directly into the project's `apk_files` folder, next to `app_server.py`. Refresh the browser page, select an authorized ADB device, choose an APK, and confirm installation. Files inside subfolders are not listed.

## 6. Add Fastboot images (optional)

Copy `.img` files directly into the project's `flash_files` folder, next to `app_server.py`. Refresh the browser page to load them. Fastboot flashing is limited to the **boot** and **recovery** partitions and requires confirmation. Erase and unlock operations are not provided by the flash helper.

> **Warning:** Flashing modifies the selected phone. An incompatible image may make the device unbootable or cause data loss. Verify the image is for the exact device model, variant, and partition. Keep a recovery plan and do not disconnect the phone during flashing.

## Troubleshooting

### `ERR_CONNECTION_REFUSED`

Phone Checker is not running. Start `python app_server.py` from the project folder and keep that PowerShell window open.

### `python`, `adb`, or `fastboot` is not recognized

Reopen PowerShell after installation or PATH changes. Confirm Python is installed and that the directory containing `adb.exe` and `fastboot.exe` is on PATH.

### The phone is not listed

- For ADB, enable USB debugging, unlock the phone, and accept the authorization prompt.
- For Fastboot, reboot the phone into bootloader/Fastboot mode.
- Try a USB data cable and another USB port.
- Check `adb devices` or `fastboot devices` directly in PowerShell.

### No APKs or images appear

Verify the correct folder (`apk_files` or `flash_files`) is beside `app_server.py`, place files directly in it (not a subfolder), and refresh the browser page. APKs must end in `.apk`; flash images must end in `.img`.

### Port 8000 is already in use

Check whether another Phone Checker server is already running before closing any process. Alternatively, stop the existing server with **Ctrl+C** in its PowerShell window, then restart Phone Checker.
