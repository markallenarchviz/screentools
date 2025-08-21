const { app, Menu, Tray, screen } = require("electron");
const path = require("path");
const { exec } = require("child_process");

// Variáveis para controlar o estado da aplicação
let tray = null;
let ffmpegProcess = null; // Armazena o processo filho do ffmpeg
let isRecording = false; // Flag para controlar o estado da gravação

/**
 * Inicia a gravação da tela inteira.
 */
const startRecording = () => {
  // Se já estiver gravando, não faz nada
  if (isRecording) return;

  isRecording = true;
  updateTrayMenu(); // Atualiza o menu para exibir "Stop Recording"

  // Obtém o tamanho da tela principal
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const desktopPath = app.getPath("desktop"); // Caminho para a área de trabalho
  const outputPath = path.join(desktopPath, `gravacao-${Date.now()}.mp4`); // Nome do arquivo de saída

  // Comando do ffmpeg para gravar a tela.
  // Este comando pode precisar de ajustes dependendo do seu sistema operacional.
  // Certifique-se de que o ffmpeg está instalado e no PATH do seu sistema.
  let command;
  switch (process.platform) {
    case 'win32': // Windows
      // 'gdigrab' captura a área de trabalho no Windows.
      command = `ffmpeg -f gdigrab -framerate 30 -i desktop -c:v libx264 -preset ultrafast -pix_fmt yuv420p "${outputPath}"`;
      break;
    case 'darwin': // macOS
      // 'avfoundation' é usado para macOS. O dispositivo "1:0" pode variar.
      // Você pode precisar conceder permissões de gravação de tela para o seu terminal ou app.
      command = `ffmpeg -f avfoundation -i "1:0" -r 30 -c:v libx264 -preset ultrafast -pix_fmt yuv420p "${outputPath}"`;
      break;
    case 'linux': // Linux
      // 'x11grab' para Linux. ':0.0' representa o display principal.
      command = `ffmpeg -f x11grab -r 30 -s ${width}x${height} -i :0.0 -c:v libx264 -preset ultrafast -pix_fmt yuv420p "${outputPath}"`;
      break;
    default:
      console.error("Plataforma não suportada para gravação.");
      isRecording = false;
      updateTrayMenu(); // Reverte o menu
      return;
  }

  console.log("Iniciando gravação da tela inteira...");
  console.log(`Comando executado: ${command}`);

  // Executa o comando ffmpeg como um processo filho
  ffmpegProcess = exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Erro ao executar ffmpeg: ${error.message}`);
      // Poderia exibir uma notificação de erro para o usuário aqui
    }
    console.log(`ffmpeg stdout: ${stdout}`);
    console.error(`ffmpeg stderr: ${stderr}`);
  });

  // Lida com o encerramento do processo ffmpeg
  ffmpegProcess.on('exit', (code) => {
    console.log(`Processo ffmpeg encerrado com código ${code}`);
    // O código 255 geralmente indica que foi interrompido pela tecla 'q', o que é normal.
    if (code !== 0 && code !== 255) {
      console.error("A gravação falhou ou foi interrompida inesperadamente.");
    } else {
      console.log(`Gravação salva com sucesso em: ${outputPath}`);
    }
    // Reseta o estado
    isRecording = false;
    ffmpegProcess = null;
    updateTrayMenu();
  });
};

/**
 * Para a gravação da tela.
 */
const stopRecording = () => {
  // Se não estiver gravando ou o processo não existir, não faz nada
  if (!isRecording || !ffmpegProcess) return;

  console.log("Parando a gravação...");
  // Envia o caractere 'q' para o stdin do ffmpeg, que é o comando para parar a gravação de forma segura.
  ffmpegProcess.stdin.write('q');
  // O evento 'exit' do processo cuidará da limpeza do estado.
};

/**
 * Constrói e atualiza o menu da bandeja com base no estado da gravação.
 */
const updateTrayMenu = () => {
  const template = [
    isRecording
      ? {
          label: "Stop Recording",
          click: stopRecording,
        }
      : {
          label: "Record Screen",
          click: startRecording,
        },
    {
      label: "Record Area",
      click: () => console.log("Iniciando gravação de área selecionada... (não implementado)"),
    },
    { type: "separator" },
    { label: "Sair", click: () => app.quit() },
  ];

  const contextMenu = Menu.buildFromTemplate(template);
  tray.setContextMenu(contextMenu);

  // Garante que o clique esquerdo também funcione, como no código original
  tray.removeAllListeners('click'); // Remove listeners antigos para evitar duplicação
  tray.on("click", () => {
    tray.popUpContextMenu(); // Abre o menu que acabamos de definir
  });
};


app.whenReady().then(() => {
  tray = new Tray(path.join(__dirname, "icon.png")); // Ícone da bandeja
  tray.setToolTip("Meu App de Gravação");

  updateTrayMenu(); // Cria e define o menu inicial
});

// Garante que a gravação seja interrompida se o aplicativo for fechado
app.on('before-quit', () => {
  if (isRecording) {
    stopRecording();
  }
});