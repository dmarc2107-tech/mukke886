const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors()); 

app.get('/', (req, res) => {
    res.send('✅ Der Rap Quiz Multiplayer-Server (2v2 Ready) läuft einwandfrei!');
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// Speicher für alle aktiven Räume und Spieler
const rooms = {};

io.on('connection', (socket) => {
    console.log('Ein Spieler ist online:', socket.id);

    // 1. Host erstellt eine Lobby
    socket.on('createRoom', (userData) => {
        const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
        socket.join(roomCode);
        
        rooms[roomCode] = {
            host: socket.id,
            players: [{ id: socket.id, name: userData.name, avatar: userData.avatar, score: 0, lives: 3 }]
        };
        
        socket.emit('roomCreated', roomCode);
        io.to(roomCode).emit('lobbyUpdate', rooms[roomCode].players);
    });

    // 2. Spieler tritt bei (Max 4 Spieler)
    socket.on('joinRoom', (data) => {
        const room = rooms[data.code];
        if (room && room.players.length < 4) {
            socket.join(data.code);
            room.players.push({ id: socket.id, name: data.name, avatar: data.avatar, score: 0, lives: 3 });
            
            // Sage dem neuen Spieler, welchen Index (0 bis 3) er hat
            socket.emit('joinedSuccess', { roomCode: data.code, myIndex: room.players.length - 1 });
            // Update an alle im Raum senden
            io.to(data.code).emit('lobbyUpdate', room.players);
        } else {
            socket.emit('errorMsg', 'Lobby voll oder nicht gefunden');
        }
    });

    // 3. Host startet das Spiel
    socket.on('startGame', (code) => {
        io.to(code).emit('gameReady', code);
    });

    // 4. Host sendet die Songs
    socket.on('syncRoundData', (data) => {
        socket.to(data.roomCode).emit('receiveRoundData', data);
    });

    // 5. Punkte-Updates
    socket.on('syncStats', (data) => {
        const room = rooms[data.roomCode];
        if(room) {
            const p = room.players.find(p => p.id === socket.id);
            if(p) { p.score = data.score; p.lives = data.lives; }
            io.to(data.roomCode).emit('updateAllStats', room.players);
        }
    });

    // 6. Tag-Team Synchronisation (Partner zieht nach)
    socket.on('teammateAnswered', (data) => {
        socket.to(data.roomCode).emit('teammateAnswered', data);
    });
    
    socket.on('nextRound', (data) => {
        socket.to(data.roomCode).emit('triggerNextRound', data);
    });

    // 7. Team stirbt oder Spielende
    socket.on('gameOver', (data) => {
        socket.to(data.roomCode).emit('opponentGameOver', data);
    });

    socket.on('disconnect', () => {
        for (let code in rooms) {
            let r = rooms[code];
            let idx = r.players.findIndex(p => p.id === socket.id);
            if (idx !== -1) {
                r.players.splice(idx, 1);
                io.to(code).emit('lobbyUpdate', r.players);
                if (r.players.length === 0) delete rooms[code];
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server läuft auf Port ${PORT}`);
});
