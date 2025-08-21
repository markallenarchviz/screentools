const { app, Menu, Tray, screen, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { exec } = require("child_process");

// Variáveis globais
let tray = null;
let ffmpegProcess = null;
let isRecording = false;
let counterWindow = null;
let counterInterval = null;
let seconds = 0;
const COUNTER_WINDOW_HEIGHT = 30;

/**
 * Cria a janela do contador de tempo.
 */
const createCounterWindow = () => {
    counterWindow = new BrowserWindow({
        width: 120,
        height: COUNTER_WINDOW_HEIGHT,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        focusable: false,
        webPreferences: {
            preload: path.join(__dirname, 'counter.js'),
        },
    });

    counterWindow.setIgnoreMouseEvents(true, { forward: true });
    counterWindow.loadFile('counter.html');
    counterWindow.setContentProtection(true); // Impede a captura da janela (Win/macOS)

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width } = primaryDisplay.workAreaSize;
    counterWindow.setPosition(Math.round((width / 2) - 60), 0);

    counterWindow.on('close', (e) => {
        e.preventDefault();
        counterWindow.hide();
    });

    counterWindow.hide(); // A janela começa escondida
};


/**
 * Inicia a gravação (tela cheia ou área selecionada).
 * @param {object|null} area - Objeto com {x, y, width, height} ou null para tela cheia.
 */
const startRecording = () => {
    if (isRecording) return;
    isRecording = true;
    updateTrayMenu();

    // Inicia e exibe o contador
    seconds = 0;
    counterWindow.webContents.send('update-timer', '00:00');
    counterWindow.show();
    counterInterval = setInterval(() => {
        seconds++;
        const formattedTime = new Date(seconds * 1000).toISOString().substr(14, 5);
        counterWindow.webContents.send('update-timer', formattedTime);
    }, 1000);

    const desktopPath = app.getPath("desktop");
    const outputPath = path.join(desktopPath, `gravacao-${Date.now()}.mp4`);
    const commonOptions = `-c:v libx264 -preset ultrafast -pix_fmt yuv420p "${outputPath}"`;
    let command;

    switch (process.platform) {
        case 'win32':
            command = `ffmpeg -f gdigrab -framerate 30 -i desktop ${commonOptions}`;
            break;
        case 'darwin':
            command = `ffmpeg -f avfoundation -i "1:0" -r 30 ${commonOptions}`;
            break;
        case 'linux':
            const { width, height } = screen.getPrimaryDisplay().workAreaSize;
            command = `ffmpeg -f x11grab -r 30 -s ${width}x${height} -i :0.0 ${commonOptions}`;
            break;
        default:
            console.error("Plataforma não suportada.");
            isRecording = false;
            updateTrayMenu();
            return;
    }

    console.log("Iniciando gravação...", `Comando: ${command}`);
    ffmpegProcess = exec(command, (error) => {
        if (error && !error.killed) {
            console.error(`Erro ao executar ffmpeg: ${error.message}`);
        }
    });

    ffmpegProcess.on('exit', (code) => {
        console.log(`Processo ffmpeg encerrado com código ${code}`);
        if (code !== 0 && code !== 255) console.error("A gravação falhou.");
        else console.log(`Gravação salva em: ${outputPath}`);
        
        isRecording = false;
        ffmpegProcess = null;
        updateTrayMenu();
        clearInterval(counterInterval);
        counterWindow.hide();
    });
};

/**
 * Para a gravação da tela.
 */
const stopRecording = () => {
    if (!isRecording || !ffmpegProcess) return;
    console.log("Parando a gravação...");
    ffmpegProcess.stdin.write('q');
};

/**
 * Constrói e atualiza o menu da bandeja.
 */
const updateTrayMenu = () => {
    const template = [
        isRecording
            ? { label: "Stop Recording", click: stopRecording }
            : { label: "Record Screen", click: startRecording },
        { type: "separator" },
        { label: "Sair", click: () => app.quit() },
    ];

    const contextMenu = Menu.buildFromTemplate(template);
    tray.setContextMenu(contextMenu);
    tray.removeAllListeners('click');
    tray.on("click", () => tray.popUpContextMenu());
};

// Ciclo de vida da aplicação
ipcMain.on('stop-recording', stopRecording);

// Make the counter window clickable
ipcMain.on('make-window-clickable', () => {
    counterWindow.setIgnoreMouseEvents(false);
});

// Make the counter window unclickable
ipcMain.on('make-window-unclickable', () => {
    counterWindow.setIgnoreMouseEvents(true, { forward: true });
});

app.whenReady().then(() => {
    tray = new Tray(path.join(__dirname, "icon.png"));
    tray.setToolTip("Screen Recorder");
    createCounterWindow();
    updateTrayMenu();
});

app.on('before-quit', () => {
    if (isRecording) stopRecording();
    if (counterWindow) counterWindow.destroy();
});
