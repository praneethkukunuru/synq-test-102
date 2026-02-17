const socket = io();

const lobbySection = document.getElementById("lobby");
const gameSection = document.getElementById("game");
const playerNameInput = document.getElementById("playerName");
const roomCodeInput = document.getElementById("roomCodeInput");
const createRoomButton = document.getElementById("createRoom");
const joinRoomButton = document.getElementById("joinRoom");
const copyRoomCodeButton = document.getElementById("copyRoomCode");
const rematchButton = document.getElementById("rematch");
const lobbyMessage = document.getElementById("lobbyMessage");
const gameMessage = document.getElementById("gameMessage");
const roomCodeValue = document.getElementById("roomCodeValue");
const statusText = document.getElementById("status");
const scoreX = document.getElementById("scoreX");
const scoreO = document.getElementById("scoreO");
const cells = Array.from(document.querySelectorAll(".cell"));

let localPlayerSymbol = "";
let currentRoomCode = "";
let currentBoard = Array(9).fill("");
let currentTurn = "X";
let isGameOver = false;

function getPlayerName() {
  return playerNameInput.value.trim() || "Player";
}

function setLobbyMessage(message) {
  lobbyMessage.textContent = message || "";
}

function setGameMessage(message) {
  gameMessage.textContent = message || "";
}

function showGame() {
  lobbySection.classList.add("hidden");
  gameSection.classList.remove("hidden");
}

function renderBoard(board) {
  currentBoard = board;
  cells.forEach((cell, index) => {
    cell.textContent = board[index];
  });
}

function setBoardInteractivity() {
  const localTurn = currentTurn === localPlayerSymbol;
  cells.forEach((cell, index) => {
    const occupied = currentBoard[index] !== "";
    cell.disabled = isGameOver || occupied || !localTurn;
  });
}

function updateStatus(state) {
  if (state.winner) {
    statusText.textContent = state.winner === "draw" ? "Round result: Draw" : `Round result: ${state.winner} wins`;
    return;
  }

  if (state.players.X && state.players.O) {
    const turnName = state.players[state.turn]?.name || state.turn;
    statusText.textContent = `Turn: ${turnName} (${state.turn})`;
    return;
  }

  statusText.textContent = "Waiting for another player to join...";
}

function renderState(state) {
  currentTurn = state.turn;
  isGameOver = Boolean(state.winner);

  roomCodeValue.textContent = state.roomCode;
  renderBoard(state.board);
  scoreX.textContent = `X: ${state.scores.X}`;
  scoreO.textContent = `O: ${state.scores.O}`;
  updateStatus(state);
  setBoardInteractivity();
}

createRoomButton.addEventListener("click", () => {
  setLobbyMessage("");
  socket.emit("create_room", { name: getPlayerName() });
});

joinRoomButton.addEventListener("click", () => {
  const roomCode = roomCodeInput.value.trim().toUpperCase();
  if (!roomCode) {
    setLobbyMessage("Enter a room code to join.");
    return;
  }
  setLobbyMessage("");
  socket.emit("join_room", { roomCode, name: getPlayerName() });
});

copyRoomCodeButton.addEventListener("click", async () => {
  if (!currentRoomCode) {
    return;
  }
  try {
    await navigator.clipboard.writeText(currentRoomCode);
    setGameMessage("Room code copied.");
  } catch {
    setGameMessage("Could not copy code. Copy it manually.");
  }
});

cells.forEach((cell) => {
  cell.addEventListener("click", () => {
    const index = Number(cell.dataset.index);
    socket.emit("make_move", { roomCode: currentRoomCode, index });
  });
});

rematchButton.addEventListener("click", () => {
  socket.emit("request_rematch", { roomCode: currentRoomCode });
});

socket.on("room_joined", ({ roomCode, symbol, state }) => {
  currentRoomCode = roomCode;
  localPlayerSymbol = symbol;
  showGame();
  setGameMessage(`You are ${symbol}.`);
  renderState(state);
});

socket.on("state_update", (state) => {
  renderState(state);
});

socket.on("round_reset", (state) => {
  setGameMessage("New round started.");
  renderState(state);
});

socket.on("error_message", ({ message }) => {
  if (!gameSection.classList.contains("hidden")) {
    setGameMessage(message);
    return;
  }
  setLobbyMessage(message);
});

socket.on("player_left", ({ message }) => {
  setGameMessage(message);
});
