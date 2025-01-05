class GameUI {
    constructor() {
        this.socket = io();
        this.myTurn = false;
        this.gameStarted = false;
        this.playerName = '';
        this.setupEventListeners();
        this.setupSocketListeners();
        
        // Enhanced debug info
        this.gameState = {
            currentTurn: null,
            lastClaim: null,
            myCards: [],
            players: [],
            eventLog: [],  // Track all events
            uiState: {     // Track UI element states
                bidButtonEnabled: false,
                disputeButtonEnabled: false,
                bidControlsVisible: false,
                startButtonVisible: false
            }
        };

        this.debug('GameUI initialized', this.gameState);
    }

    // Track UI state changes
    updateUIState(changes) {
        Object.assign(this.gameState.uiState, changes);
        this.debug('UI State Updated', this.gameState.uiState);
    }

    // Track game events
    logEvent(event, data) {
        const eventLog = {
            timestamp: new Date().toISOString(),
            event,
            data,
            uiState: {...this.gameState.uiState}
        };
        this.gameState.eventLog.push(eventLog);
        this.debug('Event Logged', eventLog);
        this.updateDebugPanel();
    }

    // Enhanced UI Event Listeners
    setupEventListeners() {
        document.querySelectorAll('input[name="cardType"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.updateSelectedCard(e.target);
                this.logEvent('cardSelected', {
                    cardType: e.target.value,
                    element: e.target.parentElement.textContent.trim()
                });
            });
        });

        // Track number input changes
        document.getElementById('cardAmount').addEventListener('change', (e) => {
            this.logEvent('amountChanged', {
                newValue: e.target.value,
                min: e.target.min,
                max: e.target.max
            });
        });
    }

    // Enhanced Socket Event Listeners
    setupSocketListeners() {
        this.socket.on('playerList', (players) => {
            this.gameState.players = players;
            this.updatePlayerList(players);
            this.logEvent('playerListUpdated', {
                playerCount: players.length,
                players: players.map(p => ({name: p.name, lives: p.lives}))
            });
        });

        this.socket.on('gameStarted', (firstPlayer) => {
            this.gameStarted = true;
            this.log(`Game started! ${firstPlayer}'s turn`);
            this.debug('Game started, first player:', firstPlayer);
        });

        this.socket.on('yourCards', (cards) => {
            this.gameState.myCards = cards;
            this.updateCards(cards);
            this.debug('Received cards:', cards);
        });

        this.socket.on('nextTurn', (playerName) => {
            this.handleNextTurn(playerName);
            this.debug('Next turn:', playerName);
        });

        this.socket.on('newClaim', (claim) => {
            this.handleNewClaim(claim);
            this.debug('New claim:', claim);
        });

        this.socket.on('disputeResult', (result) => {
            this.handleDisputeResult(result);
            this.debug('Dispute result:', result);
        });

        this.socket.on('error', (message) => {
            this.handleError(message);
            this.debug('Error:', message);
        });
    }

    // Enhanced UI Update Methods
    updatePlayerList(players) {
        const playerList = document.getElementById('playerList');
        playerList.textContent = players.map(p => `${p.name} (${p.lives} lives)`).join(', ');
        this.logEvent('playerListRendered', {
            element: 'playerList',
            content: playerList.textContent
        });
    }

    updateCards(cards) {
        const cardsDiv = document.getElementById('cards');
        cardsDiv.innerHTML = cards.map(card => `
            <div class="card">Card ${card}</div>
        `).join('');
        this.logEvent('cardsRendered', {
            element: 'cards',
            cardCount: cards.length,
            cards
        });
    }

    updateSelectedCard(radio) {
        document.querySelectorAll('.card-type-selection label').forEach(label => {
            label.classList.remove('selected');
        });
        if (radio.checked) {
            radio.parentElement.classList.add('selected');
        }
    }

    // Enhanced Game Action Methods
    joinGame() {
        const nameInput = document.getElementById('playerName');
        this.playerName = nameInput.value;
        if (!this.playerName) {
            this.logEvent('joinGameFailed', {reason: 'Empty player name'});
            return;
        }
        
        this.socket.emit('joinGame', this.playerName);
        document.getElementById('login').style.display = 'none';
        document.getElementById('game').style.display = 'block';
        document.getElementById('startButton').style.display = 'block';
        
        this.updateUIState({
            startButtonVisible: true
        });
        this.logEvent('joinGameSuccess', {
            playerName: this.playerName,
            uiChanges: ['login hidden', 'game shown', 'start button shown']
        });
    }

    startGame() {
        this.socket.emit('startGame');
        document.getElementById('startButton').style.display = 'none';
        this.debug('Starting game');
    }

    showBidControls() {
        document.getElementById('claimControls').style.display = 'block';
        document.getElementById('bidButton').disabled = true;
        
        this.updateUIState({
            bidControlsVisible: true,
            bidButtonEnabled: false
        });
        this.logEvent('bidControlsShown', {
            trigger: 'showBidControls',
            currentTurn: this.myTurn
        });
    }

    makeClaim() {
        const amount = parseInt(document.getElementById('cardAmount').value);
        const selectedCard = document.querySelector('input[name="cardType"]:checked');
        
        if (!selectedCard) {
            this.logEvent('claimFailed', {reason: 'No card selected'});
            this.log("Please select a card type");
            return;
        }
        
        if (amount < 1 || amount > 6) {
            this.logEvent('claimFailed', {
                reason: 'Invalid amount',
                amount,
                validRange: {min: 1, max: 6}
            });
            this.log("Please enter a number between 1 and 6");
            return;
        }
        
        const claim = { amount, cardType: selectedCard.value };
        this.socket.emit('makeClaim', claim);
        document.getElementById('claimControls').style.display = 'none';
        this.myTurn = false;
        
        this.updateUIState({
            bidControlsVisible: false,
            myTurn: false
        });
        this.logEvent('claimMade', {
            claim,
            previousState: {...this.gameState.uiState}
        });
    }

    dispute() {
        this.socket.emit('dispute');
        document.getElementById('disputeButton').disabled = true;
        document.getElementById('bidButton').disabled = true;
        this.debug('Disputing last claim');
    }

    // Enhanced Event Handlers
    handleNextTurn(playerName) {
        const isMyTurn = playerName === this.playerName;
        this.myTurn = isMyTurn;
        
        const newState = {
            bidButtonEnabled: !isMyTurn,
            disputeButtonEnabled: isMyTurn,
            bidControlsVisible: isMyTurn
        };
        
        document.getElementById('bidButton').disabled = !isMyTurn;
        document.getElementById('disputeButton').disabled = isMyTurn;
        document.getElementById('claimControls').style.display = isMyTurn ? 'block' : 'none';
        
        this.updateUIState(newState);
        this.logEvent('turnChanged', {
            newTurn: playerName,
            isMyTurn,
            uiChanges: newState
        });
        
        this.log(`It's ${playerName}'s turn`);
    }

    handleNewClaim(claim) {
        this.gameState.lastClaim = claim;
        this.log(`${claim.playerName} bids there are ${claim.amount} Card ${claim.cardType}`);
        
        const isMyTurn = claim.playerName === this.playerName;
        document.getElementById('disputeButton').disabled = isMyTurn;
        document.getElementById('bidButton').disabled = isMyTurn;
    }

    handleDisputeResult(result) {
        this.log(`${result.disputer} disputed ${result.disputed}'s claim!`);
        this.log(`Actual count of Card ${result.cardType}: ${result.actualCount}`);
        this.log(`Claimed count: ${result.claimed}`);
        this.log(`${result.loser} loses a life!`);
        
        document.getElementById('disputeButton').disabled = true;
        document.getElementById('bidButton').disabled = true;
        document.getElementById('claimControls').style.display = 'none';
    }

    handleError(message) {
        this.log(`Error: ${message}`);
        document.getElementById('disputeButton').disabled = false;
        document.getElementById('bidButton').disabled = false;
    }

    // Enhanced Debug Methods
    updateDebugPanel() {
        if (!window.DEBUG) return;

        const debugInfo = {
            playerName: this.playerName,
            myTurn: this.myTurn,
            gameStarted: this.gameStarted,
            gameState: {
                ...this.gameState,
                eventLog: this.gameState.eventLog.slice(-5) // Show last 5 events
            }
        };

        const debugPanel = document.getElementById('debugInfo');
        debugPanel.textContent = JSON.stringify(debugInfo, null, 2);
    }

    debug(label, data) {
        if (window.DEBUG) {
            console.log(`[${new Date().toISOString()}] ${label}:`, data);
            this.updateDebugPanel();
        }
    }
}

// Initialize game with enhanced debugging
window.DEBUG = true;
window.game = new GameUI(); 