const $ = document.querySelector.bind(document);
let running = false;
let buttonState = false;

const WEBFLASH_ENABLE_AUTOFLASH = 1
const WEBFLASH_ENABLE_USBFLASHER = 2
const WEBFLASH_FOCUS = 3
export const WEBFLASH_BLUR = 4
const WEBFLASH_POWER_ON = 5
const WEBFLASH_POWER_OFF = 6
const WEBFLASH_SIMPLE_FILE_FLASH = 7

export function cleanup() {
    wsCmd(WEBFLASH_BLUR);
    window.flashmodule = null;
}

export async function init() {
    // Register this module globally so main.js can find it
    window.flashmodule = {
        print: print,
        wsCmd: wsCmd,
        WEBFLASH_BLUR: WEBFLASH_BLUR
    };
    
    // Clear console and show startup message
    print("clear");
    print("OpenEPL Flash Module Initialized", "green");
    print("Connecting to flasher...", "yellow");
    
    // Test socket connectivity
    if (window.socket && window.socket.readyState === WebSocket.OPEN) {
        print("WebSocket connection: OK", "green");
        wsCmd(WEBFLASH_FOCUS);
        print("Checking firmware files...", "yellow");
        await checkTagFW();
        print("Flash module ready. Connect a tag to begin flashing.", "cyan");
    } else {
        print("WebSocket connection: FAILED", "red");
        print("Waiting for connection...", "yellow");
        
        // Retry connection check
        const checkConnection = setInterval(() => {
            if (window.socket && window.socket.readyState === WebSocket.OPEN) {
                print("WebSocket connection: OK", "green");
                wsCmd(WEBFLASH_FOCUS);
                checkTagFW().then(() => {
                    print("Flash module ready. Connect a tag to begin flashing.", "cyan");
                });
                clearInterval(checkConnection);
            }
        }, 1000);
    }
}

export function wsCmd(command) {
    const dataToSend = {
        flashcmd: command,
    };
    const jsonData = JSON.stringify(dataToSend);
    
    // Get socket from window object (from main.js)
    if (window.socket && window.socket.readyState === WebSocket.OPEN) {
        window.socket.send(jsonData);
    } else {
        print("WebSocket not connected", "red");
    }
}

$('#doAutoflash').onclick = function () {
    if (running) {
        print("Flash operation already in progress", "yellow");
        return;
    }
    
    print("Starting automatic flash mode...", "green");
    print("Connect a tag to the SWD connector to begin flashing", "cyan");
    
    disableButtons(true);
    running = true;

    wsCmd(WEBFLASH_ENABLE_AUTOFLASH);

    // Re-enable buttons after a short delay
    setTimeout(() => {
        running = false;
        disableButtons(false);
        print("Automatic flash mode enabled", "green");
    }, 1000);
}

$('#doUSBflash').onclick = function () {
    if (running) {
        print("Flash operation already in progress", "yellow");
        return;
    }
    
    print("Enabling USB flasher mode...", "green");
    print("Use OEPL-Flasher.py with --ip argument to connect", "cyan");
    
    disableButtons(true);
    running = true;

    wsCmd(WEBFLASH_ENABLE_USBFLASHER);

    // Re-enable buttons after a short delay
    setTimeout(() => {
        running = false;
        disableButtons(false);
        print("USB flasher mode enabled", "green");
    }, 1000);
}

$('#doPowerOn').onclick = function () {
    if (running) {
        print("Operation already in progress", "yellow");
        return;
    }
    
    print("Powering on tag connector...", "green");
    disableButtons(true);
    running = true;

    wsCmd(WEBFLASH_POWER_ON);

    setTimeout(() => {
        running = false;
        disableButtons(false);
        print("Tag connector powered on", "green");
    }, 1000);
}

$('#doPowerOff').onclick = function () {
    if (running) {
        print("Operation already in progress", "yellow");
        return;
    }
    
    print("Powering off tag connector...", "yellow");
    disableButtons(true);
    running = true;

    wsCmd(WEBFLASH_POWER_OFF);

    setTimeout(() => {
        running = false;
        disableButtons(false);
        print("Tag connector powered off", "yellow");
    }, 1000);
}

$('#doSimpleFileFlash').onclick = function () {
    if (running) {
        print("Flash operation already in progress", "yellow");
        return;
    }
    
    print("Select a firmware file to upload and flash...", "cyan");
    // Trigger file input dialog
    $('#flashFileInput').click();
}

$('#flashFileInput').onchange = function (event) {
    const file = event.target.files[0];
    if (!file) {
        print("No file selected", "yellow");
        return;
    }
    
    if (running) {
        print("Flash operation already in progress", "yellow");
        return;
    }
    
    // Validate file type
    const validExtensions = ['.bin', '.hex', '.elf'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (!validExtensions.includes(fileExtension)) {
        print(`Invalid file type: ${fileExtension}. Supported: ${validExtensions.join(', ')}`, "red");
        event.target.value = '';
        return;
    }
    
    disableButtons(true);
    running = true;
    
    print(`Uploading file: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`, "cyan");
    
    // Upload file first, then flash
    uploadFlashFile(file)
        .then(() => {
            print("File uploaded successfully. Starting flash...", "green");
            wsCmd(WEBFLASH_SIMPLE_FILE_FLASH);
            print("Flash command sent. Check console for progress...", "cyan");
        })
        .catch((error) => {
            print("Error uploading file: " + error, "red");
        })
        .finally(() => {
            setTimeout(() => {
                running = false;
                disableButtons(false);
            }, 2000);
            // Clear the file input
            event.target.value = '';
        });
}

async function uploadFlashFile(file) {
    const formData = new FormData();
    formData.append('path', '/flash_temp.bin');
    formData.append('file', file, file.name);

    const response = await fetch('littlefs_put', {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    }
    
    return response;
}

export function print(line, color = "white") {
    const consoleDiv = document.getElementById('flashconsole');
    if (!consoleDiv) {
        console.log("Flash console not found, message:", line);
        return;
    }
    
    if (color == "clear") {
        consoleDiv.innerHTML = "";
        return;
    }

    const isScrolledToBottom = consoleDiv.scrollHeight - consoleDiv.clientHeight <= consoleDiv.scrollTop + 5;
    const newLine = document.createElement('div');
    newLine.style.color = color;

    if (line.startsWith("<")) {
        const existingLines = consoleDiv.getElementsByTagName('div');
        let lastLine;

        for (let i = existingLines.length - 1; i >= 0; i--) {
            const lineText = existingLines[i].textContent;
            if (lineText.startsWith("  ")) {
                lastLine = existingLines[i];
                break;
            }
        }
        if (lastLine) {
            lastLine.innerHTML = line.substring(1) + lastLine.innerHTML.substring(line.length - 1);
            lastLine.style.color = color;
        }
    } else if (line.startsWith("\r")) {
        const existingLines = consoleDiv.getElementsByTagName('div');
        if (existingLines.length > 0) {
            const lastLine = existingLines[existingLines.length - 1];
            lastLine.innerHTML = line.substring(1);
            lastLine.style.color = color;
        }
    } else {
        newLine.textContent = line;
        consoleDiv.appendChild(newLine);
    }

    if (isScrolledToBottom) {
        consoleDiv.scrollTop = consoleDiv.scrollHeight;
    }
    
    // Also log to browser console for debugging
    console.log(`[Flash] ${line}`);
}

function disableButtons(active) {
    $("#flashtab").querySelectorAll('button').forEach(button => {
        button.disabled = active;
    });
    buttonState = active;
}

const fetchAndPost = async (url, name, path) => {
    try {
        print("updating " + path);
        const response = await fetch(url);
        const fileContent = await response.blob();

        const formData = new FormData();
        formData.append('path', path);
        formData.append('file', fileContent, name);

        const uploadResponse = await fetch('littlefs_put', {
            method: 'POST',
            body: formData
        });

        if (!uploadResponse.ok) {
            print(`${uploadResponse.status} ${uploadResponse.statusText}`, "red");
            return false;
        } else {
            print(`Firmware file downloaded`, "green");
            return true;
        }
    } catch (error) {
        print('error: ' + error, "red");
        return false;
    }
};

async function checkTagFW() {
    const fwfile = "/Tag_FW_Pack.bin";
    const url = "check_file?path=" + encodeURIComponent(fwfile);
    try {
        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            if (data.filesize > 0) {
                print(`File ${fwfile} found`, "green");
            } else {
                print(`File ${fwfile} not found. Downloading...`, "yellow");
                const success = await fetchAndPost("https://raw.githubusercontent.com/OpenEPaperLink/OpenEPaperLink/master/binaries/Tag/Tag_FW_Pack.bin", "Tag_FW_Pack.bin", fwfile);
                if (!success) {
                    print("Failed to download firmware file", "red");
                }
            }
        } else {
            print(`error checking file ${fwfile}: ${response.status}`, "red");
        }
    } catch (error) {
        print(`error checking firmware file: ${error}`, "red");
    }
}
