var redis = require("redis"),
    crypto = require("crypto"),
    fs = require("fs"),
    EventEmitter = require("events").EventEmitter,
    util = require("util");

module.exports.createWorker = function(assemblageId, config){
    return new Worker(assemblageId, config);
}

function Worker(assemblageId, config){
    EventEmitter.call(this);

    this.type = "worker";

    this.assemblageId = (assemblageId || "").toString().trim();
    this.id = crypto.randomBytes(10).toString("hex");

    this.config = config || {};
    this.redisClient = redis.createClient(this.config.port, this.config.host);

    this.scripts = {};

    this.prefix = this.assemblageId ? this.assemblageId + "." : "";
    this.db = (Math.abs(Number(this.config.db) || 0)) % 16;

    this.startPeriodicalJobs();
}
util.inherits(Worker, EventEmitter);

Worker.prototype.startPeriodicalJobs = function(){

    this.createWorkerLock((function(err){
        if(err){
            this.emit("error", err);
        }

        setTimeout(this.updateLock.bind(this), 100);
        setTimeout(this.checkAddedJobs.bind(this), 300);
        setTimeout(this.checkDeletedJobs.bind(this), 300);
    }).bind(this));
}

Worker.prototype.scriptLoader = function(scriptName, callback){
    if(!this.scripts[scriptName]){
        this.scripts[scriptName] = {
            script: false,
            queue: [callback]
        }
    }else{
        this.scripts[scriptName].queue.push(callback);
        return;
    }

    fs.readFile(__dirname + "/../scripts/" + this.type.toLowerCase() + "_" + scriptName + ".lua", "utf-8", (function(err, script){
        if(err){
            this.emit("error", err);
        }

        this.scripts[scriptName].script = script;

        this.redisClient.script("load", this.scripts[scriptName].script , (function(){
            var handler;

            while(handler = this.scripts[scriptName].queue.shift()){
                handler();
            }

        }).bind(this));
    }).bind(this));
}

Worker.prototype.createWorkerLock = function(callback){
    this.redisClient.multi().
        select(this.db).
        zadd(this.prefix + "locks", Date.now(), this.id).
        zadd(this.prefix + "workers", 0, this.id).
        exec(function(err){
            if(err){
                return callback(err);
            }
            return callback(null, true);
        });
}

Worker.prototype.updateLock = function(){
    this.redisClient.multi().
        select(this.db).
        zscore(this.prefix + "locks", this.id).
        zadd(this.prefix + "locks", Date.now(), this.id).
        exec((function(err, replies){
            if(replies && replies[1] && Number(replies[1]) && Number(replies[1]) < Date.now() - 60 * 1000){
                this.redisClient.multi().
                    select(this.db).
                    zrem(this.prefix + "locks", this.id).
                    exec((function(){
                        this.emit("error", new Error("Expired lock, can't update"));
                    }).bind(this));
            }else{
                setTimeout(this.updateLock.bind(this), 100);
            }
        }).bind(this));
}

Worker.prototype.checkAddedJobs = function(){
    if(!this.scripts.checkAddedJobs || !this.scripts.checkAddedJobs.script){
        return this.scriptLoader("checkAddedJobs", this.checkAddedJobs.bind(this));
    }
    this.redisClient.multi().
        select(this.db).
        eval(this.scripts.checkAddedJobs.script, 3, this.prefix + "worker." + this.id + ".waiting", this.prefix + "worker." + this.id + ".accepted", this.prefix + "job.", this.id).
        exec((function(err, replies){
            if(replies && replies[1] && replies[1].length){
                replies[1].forEach((function(jobId){
                    this.emit("add", jobId);
                }).bind(this));
            }
            setTimeout(this.checkAddedJobs.bind(this), 300);
        }).bind(this));
}

Worker.prototype.checkDeletedJobs = function(){
    if(!this.scripts.checkDeletedJobs || !this.scripts.checkDeletedJobs.script){
        return this.scriptLoader("checkDeletedJobs", this.checkDeletedJobs.bind(this));
    }

    this.redisClient.multi().
        select(this.db).
        eval(this.scripts.checkDeletedJobs.script,
            7,
            this.prefix + "worker." + this.id + ".delete",
            this.prefix + "worker." + this.id + ".waiting",
            this.prefix + "worker." + this.id + ".accepted",
            this.prefix + "workers",
            this.prefix + "job.",
            this.prefix + "all",
            this.prefix + "unassigned",

            this.id).
        exec((function(err, replies){
            if(replies && replies[1] && replies[1].length){
                replies[1].forEach((function(jobId){
                    this.emit("delete", jobId);
                }).bind(this));
            }
            setTimeout(this.checkDeletedJobs.bind(this), 300);

        }).bind(this));
}

