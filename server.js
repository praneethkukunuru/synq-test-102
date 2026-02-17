const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

const rooms = new Map();
const playerRoomMap = new Map();

app.use(express.static(path.join(__dirname)));

function createRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function checkWinner(board) {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  if (board.every((cell) => cell !== "")) {
    return "draw";
  }
  return null;
}

function buildState(roomCode) {
  const room = rooms.get(roomCode);
  return {
    roomCode,
    board: room.board,
    turn: room.turn,
    winner: room.winner,
    players: room.players,
    scores: room.scores,
    rematchVotes: room.rematchVotes.length,
  };
}

function emitState(roomCode) {
  io.to(roomCode).emit("state_update", buildState(roomCode));
}

function getOrCreateUniqueRoomCode() {
  let attempts = 0;
  while (attempts < 30) {
    const code = createRoomCode();
    if (!rooms.has(code)) {
      return code;
    }
    attempts += 1;
  }
  throw new Error("Failed to allocate room code.");
}

io.on("connection", (socket) => {
  socket.on("create_room", ({ name }) => {
    try {
      const roomCode = getOrCreateUniqueRoomCode();
      rooms.set(roomCode, {
        board: Array(9).fill(""),
        turn: "X",
        winner: null,
        players: {
          X: { id: socket.id, name: (name || "Player 1").slice(0, 20) },
          O: null,
        },
        scores: { X: 0, O: 0 },
        rematchVotes: [],
      });
      playerRoomMap.set(socket.id, roomCode);
      socket.join(roomCode);
      socket.emit("room_joined", {
        roomCode,
        symbol: "X",
        state: buildState(roomCode),
      });
    } catch {
      socket.emit("error_message", { message: "Unable to create room. Try again." });
    }
  });

  socket.on("join_room", ({ roomCode, name }) => {
    const normalizedCode = (roomCode || "").toUpperCase();
    const room = rooms.get(normalizedCode);
    if (!room) {
      socket.emit("error_message", { message: "Room not found." });
      return;
    }
    if (room.players.O) {
      socket.emit("error_message", { message: "Room is already full." });
      return;
    }

    room.players.O = { id: socket.id, name: (name || "Player 2").slice(0, 20) };
    playerRoomMap.set(socket.id, normalizedCode);
    socket.join(normalizedCode);
    socket.emit("room_joined", {
      roomCode: normalizedCode,
      symbol: "O",
      state: buildState(normalizedCode),
    });
    emitState(normalizedCode);
  });

  socket.on("make_move", ({ roomCode, index }) => {
    const normalizedCode = (roomCode || "").toUpperCase();
    const room = rooms.get(normalizedCode);
    if (!room) {
      socket.emit("error_message", { message: "Room not found." });
      return;
    }
    if (!Number.isInteger(index) || index < 0 || index > 8) {
      return;
    }
    if (room.winner) {
      return;
    }

    const playerSymbol = room.players.X?.id === socket.id ? "X" : room.players.O?.id === socket.id ? "O" : null;
    if (!playerSymbol) {
      return;
    }
    if (room.turn !== playerSymbol) {
      socket.emit("error_message", { message: "Not your turn." });
      return;
    }
    if (room.board[index] !== "") {
      socket.emit("error_message", { message: "Cell already occupied." });
      return;
    }

    room.board[index] = playerSymbol;
    room.winner = checkWinner(room.board);
    if (!room.winner) {
      room.turn = room.turn === "X" ? "O" : "X";
    } else if (room.winner === "X" || room.winner === "O") {
      room.scores[room.winner] += 1;
    }
    room.rematchVotes = [];
    emitState(normalizedCode);
  });

  socket.on("request_rematch", ({ roomCode }) => {
    const normalizedCode = (roomCode || "").toUpperCase();
    const room = rooms.get(normalizedCode);
    if (!room || !room.winner) {
      return;
    }

    if (!room.rematchVotes.includes(socket.id)) {
      room.rematchVotes.push(socket.id);
    }

    const playersReady =
      room.players.X &&
      room.players.O &&
      room.rematchVotes.includes(room.players.X.id) &&
      room.rematchVotes.includes(room.players.O.id);

    if (!playersReady) {
      socket.emit("error_message", { message: "Waiting for the other player to accept rematch." });
      return;
    }

    room.board = Array(9).fill("");
    room.turn = "X";
    room.winner = null;
    room.rematchVotes = [];
    io.to(normalizedCode).emit("round_reset", buildState(normalizedCode));
  });

  socket.on("disconnect", () => {
    const roomCode = playerRoomMap.get(socket.id);
    if (!roomCode) {
      return;
    }

    playerRoomMap.delete(socket.id);
    const room = rooms.get(roomCode);
    if (!room) {
      return;
    }

    if (room.players.X?.id === socket.id) {
      room.players.X = null;
    } else if (room.players.O?.id === socket.id) {
      room.players.O = null;
    }

    io.to(roomCode).emit("player_left", { message: "The other player left the room." });
    emitState(roomCode);

    if (!room.players.X && !room.players.O) {
      rooms.delete(roomCode);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
