class GameState {
    constructor() {
        this.players = new Map(); // socketId -> player info
        this.currentTurn = null;
        this.deck = [];
        this.lastClaim = null;
        this.gameInProgress = false;
    }

    addPlayer(socketId, playerName) {
        this.players.set(socketId, {
            name: playerName,
            lives: 3,
            cards: [],
            isPlaying: false
        });
        return Array.from(this.players.values());
    }

    removePlayer(socketId) {
        this.players.delete(socketId);
        return Array.from(this.players.values());
    }

    getLivingPlayers() {
        return Array.from(this.players.entries())
            .filter(([_, player]) => player.lives > 0);
    }

    startGame() {
        if (this.players.size < 2) {
            throw new Error('Need at least 2 players to start');
        }

        this.gameInProgress = true;
        this.deck = this.shuffleDeck();
        
        const livingPlayers = this.getLivingPlayers();
        
        // Clear all players' cards first
        livingPlayers.forEach(([_, player]) => {
            player.cards = [];
        });

        // Distribute exactly 5 cards to each living player
        livingPlayers.forEach(([socketId, player]) => {
            player.cards = this.deck.splice(0, 5);
        });

        // Set first player
        this.currentTurn = livingPlayers[0][0];
        
        return {
            firstPlayer: this.players.get(this.currentTurn).name,
            playerCards: livingPlayers.map(([socketId, player]) => ({
                socketId,
                cards: player.cards.map(this.getCardType)
            }))
        };
    }

    makeClaim(socketId, claim) {
        if (socketId !== this.currentTurn) {
            throw new Error('Not your turn');
        }

        this.lastClaim = {
            playerId: socketId,
            amount: claim.amount,
            cardType: claim.cardType
        };

        const livingPlayers = this.getLivingPlayers();
        const currentIndex = livingPlayers.findIndex(([id]) => id === socketId);
        const nextIndex = (currentIndex + 1) % livingPlayers.length;
        this.currentTurn = livingPlayers[nextIndex][0];

        return {
            playerName: this.players.get(socketId).name,
            nextPlayer: this.players.get(this.currentTurn).name,
            claim
        };
    }

    dispute(disputerSocketId) {
        if (!this.lastClaim) {
            throw new Error('No claim to dispute');
        }
        
        if (disputerSocketId === this.lastClaim.playerId) {
            throw new Error('You cannot dispute your own claim');
        }
        
        const disputedPlayer = this.players.get(this.lastClaim.playerId);
        const disputer = this.players.get(disputerSocketId);
        
        if (!disputedPlayer || !disputer) {
            throw new Error('Invalid dispute: player not found');
        }
        
        // Count actual cards
        const allCards = Array.from(this.players.values())
            .flatMap(player => player.cards)
            .map(this.getCardType);
        
        const actualCount = allCards.filter(card => card === this.lastClaim.cardType).length;
        
        // Determine who loses a life
        const loser = actualCount >= this.lastClaim.amount ? disputer : disputedPlayer;
        loser.lives--;

        const result = {
            disputer: disputer.name,
            disputed: disputedPlayer.name,
            loser: loser.name,
            actualCount,
            claimed: this.lastClaim.amount,
            cardType: this.lastClaim.cardType,
            gameOver: false,
            eliminated: loser.lives <= 0
        };

        // Check if game is over
        const livingPlayers = this.getLivingPlayers();
        
        if (livingPlayers.length === 1) {
            result.gameOver = true;
            result.winner = livingPlayers[0][1].name;
            this.gameInProgress = false;
        } else {
            const newRound = this.startNewRound();
            result.newRound = newRound;
        }

        return result;
    }

    startNewRound() {
        this.deck = this.shuffleDeck();
        const livingPlayers = this.getLivingPlayers();
        
        // Clear all players' cards first
        livingPlayers.forEach(([_, player]) => {
            player.cards = [];
        });

        // Distribute exactly 5 cards to each living player
        livingPlayers.forEach(([socketId, player]) => {
            player.cards = this.deck.splice(0, 5);
        });

        this.currentTurn = livingPlayers[0][0];
        this.lastClaim = null;

        return {
            firstPlayer: this.players.get(this.currentTurn).name,
            playerCards: livingPlayers.map(([socketId, player]) => ({
                socketId,
                cards: player.cards.map(this.getCardType)
            }))
        };
    }

    // Helper methods
    shuffleDeck() {
        const deck = Array.from({length: 20}, (_, i) => i);
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    getCardType(num) {
        const CARDS = {
            A: { range: [0, 5] },
            B: { range: [6, 11] },
            C: { range: [12, 17] },
            D: { range: [18, 19] }
        };

        if (num >= CARDS.A.range[0] && num <= CARDS.A.range[1]) return 'A';
        if (num >= CARDS.B.range[0] && num <= CARDS.B.range[1]) return 'B';
        if (num >= CARDS.C.range[0] && num <= CARDS.C.range[1]) return 'C';
        if (num >= CARDS.D.range[0] && num <= CARDS.D.range[1]) return 'D';
    }
}

module.exports = GameState; 