/**
 * class Player
 */
function Player(overpassAPI, status) {
    this.overpassAPI = overpassAPI;
    this.status = status;

    this.interval = null;
    this.sequence = -1; 
    this.active = false;
    
    // number of sequences (~ 1 per minute)
    this.limit = 60 * 24; // 24h

    this.stopSequence = null;
    this.currentSequence = null;
    
    this.element = null;
    this.mode = null;
    
    var add = function(a, b) {
        return a + b;
    };
    var subtract = function(a, b) {
        return a - b;
    };

    var modes = {
        'fast_backward_button': { operation: subtract, limit: this.limit },
        'fast_forward_button': { operation: add, limit: this.limit },
        'backward_button': { operation: subtract, limit: 1 },
        'forward_button': { operation: add, limit: 1 }
    };
    
    for (id in modes) {
        document.getElementById(id).onclick = _.bind(this.toggle, this, modes[id]);
    }

    this.eleDatetime = document.getElementById('datetime');
    this.eleDatetime.onchange = _.bind(this.resetSequence, this);

    this.lastVisit = null;
    var lastVisitItem = localStorage.getItem(Status.STORAGE_KEY_LAST_VISIT);
    var eleLastVisitButton = document.getElementById('last_visit_button');
    if (lastVisitItem) {
        this.lastVisit = parseInt(lastVisitItem);
        this.setDateTimeToLastVisit();
        eleLastVisitButton.onclick = _.bind(this.setDateTimeToLastVisit, this);
        console.log('last visit: ' + moment(this.lastVisit).format("YYYY-MM-DD HH:mm:ss"));
    } else {
        this.setDateTimeToNow();
        eleLastVisitButton.classList.remove('button');
        eleLastVisitButton.classList.add('button_disabled');
    }
    document.getElementById('now_button').onclick = _.bind(this.setDateTimeToNow, this);

    document.getElementById('load_button').onclick = _.bind(this.loadTime, this);
}

/** 
 * First available sequence number for *id_sorted* diffs.
 * see http://overpass-api.de/augmented_diffs/id_sorted/
 * api/augmented_state_by_date returns 6749 for "old" format, id_sorted format
 * starts with 8385, but api returns empty result for the first ones.
 */
Player.LOWER_LIMIT = 13000;

Player.prototype.setDateTime = function(dateTime) {
    this.eleDatetime.value = oscviewer.formatIsoDateTime(dateTime);
    this.resetSequence();
};

Player.prototype.setDateTimeToLastVisit = function() {
    this.setDateTime(this.lastVisit);
};

Player.prototype.setDateTimeToNow = function() {
    this.setDateTime(Date.now());
};

Player.prototype.resetSequence = function() {
    this.sequence = -1;
};

Player.prototype.start = function(mode, element) {
    this.element = element;
    this.element.classList.add('button_active');
    this.mode = mode;
    this.active = true;
    
    if (this.sequence === -1) {
        this.getSequenceByTime(_.bind(this.startWithSequence, this));
    } else {
        this.startWithSequence();
    }
};

Player.prototype.loadCurrentSequence = function() {
    this.currentSequence = this.overpassAPI.getCurrentSequence();
    if (this.currentSequence && this.currentSequence >= 0) {
        console.log('current sequence = ' + this.currentSequence);
    } else {
        console.error('invalid current sequence: "' + this.currentSequence + '"');
        this.currentSequence = null;
    }
};

Player.prototype.startWithSequence = function() {
    var limitSequence = this.mode.operation(this.sequence, this.mode.limit);
    if (!this.currentSequence || limitSequence >= this.currentSequence) {
        this.loadCurrentSequence();
    }
    this.stopSequence = Math.min(limitSequence, this.currentSequence);
    this.stopSequence = Math.max(this.stopSequence, Player.LOWER_LIMIT);

    // skips this sequence, which is either loaded with live or loadTime 
    this.loadNext();
};

Player.prototype.load = function() {
    this.status.loadStart();
    this.overpassAPI.load(this.sequence, _.bind(this.postLoad, this));
};

Player.prototype.loadNext = function() {
    if (this.sequence !== this.stopSequence) {
        // ++ or --
        this.sequence = this.mode.operation(this.sequence, 1);
        this.load();
    } else {
        if (this.mode.limit > 1) {
            console.log('player stopped - limit reached');
        }
        this.stop();
    }
};

Player.prototype.updateStatus = function() {
    this.status.sequence = this.sequence;
    this.status.count++;
    this.status.countdown = null;
    this.status.update();
    
    if (this.status.timestamp) {
        this.eleDatetime.value = moment(this.status.timestamp).format('YYYY-MM-DD HH:mm');
    }
};

Player.prototype.postLoad = function() {
    this.status.loadEnd();
    this.updateStatus();

    if (this.active) {
        this.interval = window.setTimeout(_.bind(this.loadNext, this), 200);
    }
};

Player.prototype.stop = function() {
    this.active = false;
    this.mode = null;
    window.clearTimeout(this.interval); 
    this.interval = null;
    this.status.setCountdown(null);
    this.element.classList.remove('button_active');
};

Player.prototype.getSequenceByTime = function(callback) {
    var inputTime = moment(this.eleDatetime.value, 'YYYY-MM-DD HH:mm').seconds(59).valueOf();
    
    this.status.loadStart();
    this.overpassAPI.getSequenceByTime(inputTime, _.bind(function(sequence) {
        this.status.loadEnd();
        console.log('sequence = ' + sequence);
        this.sequence = Math.max(sequence, Player.LOWER_LIMIT);
        callback();
    }, this));
};

Player.prototype.loadTime = function(e) {
    this.getSequenceByTime(_.bind(this.load, this));
};

Player.prototype.toggle = function(mode, e) {
    if (!this.active) {
        this.start(mode, e.target || e.srcElement);
    } else {
        this.stop();
    }
};
