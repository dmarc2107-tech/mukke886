const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();

app.get('/', (req, res) => {
    res.send('✅ Der Rap Quiz Multiplayer-Server (inkl. Random Matchmaking) läuft einwandfrei!');
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

const rooms = {};
let matchmakingQueue = []; // 🔥 DIE NEUE WARTESCHLANGE

io.on('connection', (socket) => {
    console.log('Ein Spieler ist online:', socket.id);

    // ==========================================
    // 1. NEU: MATCHMAKING (RANDOM DUOS)
    // ==========================================
    socket.on('findRandomMatch', (userData) => {
        // Sicherstellen, dass der Spieler nicht doppelt in der Schlange steht
        matchmakingQueue = matchmakingQueue.filter(p => p.socket.id !== socket.id);

        if (matchmakingQueue.length > 0) {
            // 🎯 Ein Gegner wartet bereits! Match zusammenstellen.
            const opponent = matchmakingQueue.shift(); // Holt den ersten aus der Schlange
            
            // Unsichtbaren Code generieren
            const roomCode = 'RANDOM_' + Math.floor(Math.random() * 1000000);

            // Beide in den neuen Raum setzen
            socket.join(roomCode);
            opponent.socket.join(roomCode);

            rooms[roomCode] = {
                host: opponent.socket.id, // Der, der schon wartete, wird "Host" (generiert die Songs)
                players: [
                    { id: opponent.socket.id, name: opponent.userData.name, avatar: opponent.userData.avatar, score: 0, lives: 3 },
                    { id: socket.id, name: userData.name, avatar: userData.avatar, score: 0, lives: 3 }
                ]
            };

            // Beiden Spielern das Signal geben, dass ein Match gefunden wurde!
            io.to(roomCode).emit('randomMatchFound', { 
                roomCode: roomCode, 
                hostId: opponent.socket.id, 
                players: rooms[roomCode].players 
            });

        } else {
            // ⏳ Keiner da? Ab in die Warteschlange.
            matchmakingQueue.push({ socket: socket, userData: userData });
        }
    });

    // Falls der Spieler die Suche abbricht
    socket.on('cancelMatchmaking', () => {
        matchmakingQueue = matchmakingQueue.filter(p => p.socket.id !== socket.id);
    });

    // ==========================================
    // 2. ALTES SYSTEM (PRIVATE LOBBYS)
    // ==========================================
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

    socket.on('joinRoom', (data) => {
        const room = rooms[data.code];
        if (room && room.players.length < 4) {
            socket.join(data.code);
            room.players.push({ id: socket.id, name: data.name, avatar: data.avatar, score: 0, lives: 3 });
            
            socket.emit('joinedSuccess', { roomCode: data.code, myIndex: room.players.length - 1 });
            io.to(data.code).emit('lobbyUpdate', room.players);
        } else {
            socket.emit('errorMsg', 'Lobby voll oder nicht gefunden');
        }
    });

    socket.on('startGame', (code) => {
        io.to(code).emit('gameReady', code);
    });

    socket.on('syncRoundData', (data) => {
        socket.to(data.roomCode).emit('receiveRoundData', data);
    });

    socket.on('syncStats', (data) => {
        const room = rooms[data.roomCode];
        if(room) {
            const p = room.players.find(p => p.id === socket.id);
            if(p) { p.score = data.score; p.lives = data.lives; }
            io.to(data.roomCode).emit('updateAllStats', room.players);
        }
    });

    socket.on('teammateAnswered', (data) => {
        socket.to(data.roomCode).emit('teammateAnswered', data);
    });
    
    socket.on('nextRound', (data) => {
        socket.to(data.roomCode).emit('triggerNextRound', data);
    });

    socket.on('gameOver', (data) => {
        socket.to(data.roomCode).emit('opponentGameOver', data);
    });

    socket.on('disconnect', () => {
        // WICHTIG: Aus der Warteschlange löschen, falls er beim Suchen die Seite schließt
        matchmakingQueue = matchmakingQueue.filter(p => p.socket.id !== socket.id);

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
