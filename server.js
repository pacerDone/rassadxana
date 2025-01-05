const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

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

// Game state
const gameState = {
    players: new Map(), // socketId -> player info
    currentTurn: null,
    deck: [],
    lastClaim: null,
    gameInProgress: false
};

// Card constants
const CARDS = {
    A: { count: 6, range: [0, 5] },
    B: { count: 6, range: [6, 11] },
    C: { count: 6, range: [12, 17] },
    D: { count: 2, range: [18, 19] }
};

// Shuffle function
function shuffleDeck() {
    const deck = Array.from({length: 20}, (_, i) => i);
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

// Get card type from number
function getCardType(num) {
    if (num >= CARDS.A.range[0] && num <= CARDS.A.range[1]) return 'A';
    if (num >= CARDS.B.range[0] && num <= CARDS.B.range[1]) return 'B';
    if (num >= CARDS.C.range[0] && num <= CARDS.C.range[1]) return 'C';
    if (num >= CARDS.D.range[0] && num <= CARDS.D.range[1]) return 'D';
}

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('joinGame', (playerName) => {
        if (gameState.gameInProgress) {
            socket.emit('error', 'Game is already in progress');
            return;
        }

        gameState.players.set(socket.id, {
            name: playerName,
            lives: 3,
            cards: [],
            isPlaying: false
        });

        io.emit('playerList', Array.from(gameState.players.values()));
    });

    socket.on('startGame', () => {
        if (gameState.players.size < 2) {
            socket.emit('error', 'Need at least 2 players to start');
            return;
        }

        gameState.gameInProgress = true;
        gameState.deck = shuffleDeck();
        
        // Distribute 5 cards to each living player
        const livingPlayers = Array.from(gameState.players.entries())
            .filter(([_, player]) => player.lives > 0);
        
        // Clear all players' cards first
        livingPlayers.forEach(([_, player]) => {
            player.cards = [];
        });

        // Distribute exactly 5 cards to each living player
        livingPlayers.forEach(([socketId, player]) => {
            // Take the first 5 cards from the deck for this player
            player.cards = gameState.deck.splice(0, 5);
            io.to(socketId).emit('yourCards', player.cards.map(getCardType));
        });

        // The remaining cards stay in gameState.deck (unused for this round)

        // Set first player
        gameState.currentTurn = livingPlayers[0][0];
        io.emit('gameStarted', gameState.players.get(gameState.currentTurn).name);
    });

    socket.on('makeClaim', (claim) => {
        if (socket.id !== gameState.currentTurn) {
            socket.emit('error', 'Not your turn');
            return;
        }

        gameState.lastClaim = {
            playerId: socket.id,
            amount: claim.amount,
            cardType: claim.cardType
        };

        io.emit('newClaim', {
            playerName: gameState.players.get(socket.id).name,
            ...claim
        });

        // Move to next player
        const livingPlayers = Array.from(gameState.players.entries())
            .filter(([_, player]) => player.lives > 0);
        const currentIndex = livingPlayers.findIndex(([id]) => id === socket.id);
        const nextIndex = (currentIndex + 1) % livingPlayers.length;
        gameState.currentTurn = livingPlayers[nextIndex][0];
        
        io.emit('nextTurn', gameState.players.get(gameState.currentTurn).name);
    });

    socket.on('dispute', () => {
        if (!gameState.lastClaim) {
            socket.emit('error', 'No claim to dispute');
            return;
        }
        
        if (socket.id === gameState.lastClaim.playerId) {
            socket.emit('error', 'You cannot dispute your own claim');
            return;
        }
        
        const disputedPlayer = gameState.players.get(gameState.lastClaim.playerId);
        const disputer = gameState.players.get(socket.id);
        
        if (!disputedPlayer || !disputer) {
            socket.emit('error', 'Invalid dispute: player not found');
            return;
        }
        
        // Count actual cards
        const allCards = Array.from(gameState.players.values())
            .flatMap(player => player.cards)
            .map(getCardType);
        
        const actualCount = allCards.filter(card => card === gameState.lastClaim.cardType).length;
        
        // Determine who loses a life
        const loser = actualCount >= gameState.lastClaim.amount ? disputer : disputedPlayer;
        loser.lives--;

        io.emit('disputeResult', {
            disputer: disputer.name,
            disputed: disputedPlayer.name,
            loser: loser.name,
            actualCount,
            claimed: gameState.lastClaim.amount,
            cardType: gameState.lastClaim.cardType
        });

        if (loser.lives <= 0) {
            io.emit('playerEliminated', loser.name);
        }

        // Check if game is over
        const livingPlayers = Array.from(gameState.players.values())
            .filter(player => player.lives > 0);
        
        if (livingPlayers.length === 1) {
            io.emit('gameOver', livingPlayers[0].name);
            gameState.gameInProgress = false;
        } else {
            // Start new round
            startNewRound();
        }
    });

    socket.on('disconnect', () => {
        if (gameState.players.has(socket.id)) {
            gameState.players.delete(socket.id);
            io.emit('playerList', Array.from(gameState.players.values()));
        }
    });
});

function startNewRound() {
    gameState.deck = shuffleDeck();
    const livingPlayers = Array.from(gameState.players.entries())
        .filter(([_, player]) => player.lives > 0);
    
    // Clear all players' cards first
    livingPlayers.forEach(([_, player]) => {
        player.cards = [];
    });

    // Distribute exactly 5 cards to each living player
    livingPlayers.forEach(([socketId, player]) => {
        // Take the first 5 cards from the deck for this player
        player.cards = gameState.deck.splice(0, 5);
        io.to(socketId).emit('yourCards', player.cards.map(getCardType));
    });

    // The remaining cards stay in gameState.deck (unused for this round)

    gameState.currentTurn = livingPlayers[0][0];
    io.emit('newRound', gameState.players.get(gameState.currentTurn).name);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 