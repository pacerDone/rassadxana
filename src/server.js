const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const GameState = require('./gameState');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.static('public'));
app.use(express.json());

// Create game state
const game = new GameState();

// Socket connection handling
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('joinGame', (playerName) => {
        try {
            if (game.gameInProgress) {
                throw new Error('Game is already in progress');
            }
            const players = game.addPlayer(socket.id, playerName);
            io.emit('playerList', players);
            console.log(`Player ${playerName} joined the game`);
        } catch (error) {
            socket.emit('error', error.message);
            console.error('Join game error:', error);
        }
    });

    socket.on('startGame', () => {
        try {
            const { firstPlayer, playerCards } = game.startGame();
            
            // Send cards to each player
            playerCards.forEach(({ socketId, cards }) => {
                io.to(socketId).emit('yourCards', cards);
            });

            io.emit('gameStarted', firstPlayer);
            console.log('Game started, first player:', firstPlayer);
        } catch (error) {
            socket.emit('error', error.message);
            console.error('Start game error:', error);
        }
    });

    socket.on('makeClaim', (claim) => {
        try {
            const { playerName, nextPlayer, claim: claimDetails } = game.makeClaim(socket.id, claim);
            io.emit('newClaim', {
                playerName,
                ...claimDetails
            });
            io.emit('nextTurn', nextPlayer);
            console.log(`Player ${playerName} claimed ${claim.amount} ${claim.cardType}'s`);
        } catch (error) {
            socket.emit('error', error.message);
            console.error('Make claim error:', error);
        }
    });

    socket.on('dispute', () => {
        try {
            const result = game.dispute(socket.id);
            io.emit('disputeResult', result);
            
            if (result.eliminated) {
                io.emit('playerEliminated', result.loser);
            }

            if (result.gameOver) {
                io.emit('gameOver', result.winner);
            } else if (result.newRound) {
                // Send new cards to each player
                result.newRound.playerCards.forEach(({ socketId, cards }) => {
                    io.to(socketId).emit('yourCards', cards);
                });
                io.emit('newRound', result.newRound.firstPlayer);
            }
            
            console.log('Dispute result:', result);
        } catch (error) {
            socket.emit('error', error.message);
            console.error('Dispute error:', error);
        }
    });

    socket.on('disconnect', () => {
        const players = game.removePlayer(socket.id);
        io.emit('playerList', players);
        console.log('Client disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 