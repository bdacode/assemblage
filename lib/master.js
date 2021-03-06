/*jshint evil:true */

var redis = require("redis"),
    crypto = require("crypto"),
    fs = require("fs"),
    EventEmitter = require("events").EventEmitter,
    util = require("util");

module.exports.createMaster = function(assemblageId, config){
    return new Master(assemblageId, config);
};

function Master(assemblageId, config){
    EventEmitter.call(this);

    this.type = "master";

    this.id = (assemblageId || "").toString().trim();
    this.config = config || {};

    this.redisClient = this.config.client || redis.createClient(this.config.port, this.config.host);

    this.prefix = this.config.prefix || this.id || "";

    if(this.prefix.length){
        this.prefix += ".";
    }

    this.db = (Math.abs(Number(this.config.db) || 0)) % 16;

    this.expireDelay = this.config.expireDelay || 60 * 1000;

    this.scripts = {};

    this.startPeriodicalJobs();
}
util.inherits(Master, EventEmitter);

Master.prototype.startPeriodicalJobs = function(){
    setTimeout(this.assignJobs.bind(this), 100);
    setTimeout(this.checkLocks.bind(this), 500);
};

Master.prototype.scriptLoader = function(scriptName, callback){
    if(!this.scripts[scriptName]){
        this.scripts[scriptName] = {
            script: false,
            queue: [callback]
        };
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

            while((handler = this.scripts[scriptName].queue.shift())){
                handler();
            }

        }).bind(this));
    }).bind(this));
};

Master.prototype.addJob = function(payload, callback){
    if(!this.scripts.addJob || !this.scripts.addJob.script){
        return this.scriptLoader("addJob", this.addJob.bind(this, payload, callback));
    }

    if(!callback && typeof payload == "function"){
        callback = payload;
        payload = undefined;
    }

    payload = payload || {};

    var jobId = crypto.randomBytes(10).toString("hex"),
        data = {
            _id: jobId,
            _action: "add",
            _status: "queued",
            _payload: JSON.stringify(payload)
        };

    this.redisClient.multi().
        select(this.db)["eval"](this.scripts.addJob.script, 2, this.prefix + "all", this.prefix + "unassigned", jobId).
        hmset(this.prefix + "job." + jobId, data).
        exec(function(err, replies){
            if(!callback){
                return;
            }
            if(err){
                return callback(err);
            }
            return callback(null, jobId);
        });
};

Master.prototype.assignJobs = function(){
    if(!this.scripts.assignJobs  || !this.scripts.assignJobs.script){
        return this.scriptLoader("assignJobs", this.assignJobs.bind(this));
    }

    this.redisClient.multi().
        select(this.db)["eval"](this.scripts.assignJobs.script, 4, this.prefix + "workers", this.prefix + "unassigned", this.prefix + "worker.", this.prefix + "job.").
        exec((function(err, replies){
            if(replies && replies[1]){
                console.log("Assigned " + replies[1] + " jobs");
            }
            setTimeout(this.assignJobs.bind(this), 100);
        }).bind(this));
};

Master.prototype.checkLocks = function(){
    if(!this.scripts.checkLocks  || !this.scripts.checkLocks.script){
        return this.scriptLoader("checkLocks", this.checkLocks.bind(this));
    }

    this.redisClient.multi().
        select(this.db)["eval"](this.scripts.checkLocks.script, 5, this.prefix + "locks", this.prefix + "unassigned", this.prefix + "worker.", this.prefix + "job.", this.prefix + "workers", Date.now() - this.expireDelay).
        exec((function(err, replies){
            setTimeout(this.checkLocks.bind(this), 500);
        }).bind(this));
};

Master.prototype.deleteJob = function(jobId, callback){
    if(!this.scripts.deleteJob  || !this.scripts.deleteJob.script){
        return this.scriptLoader("deleteJob", this.deleteJob.bind(this, jobId, callback));
    }

    if(!callback && typeof jobId == "function"){
        callback = jobId;
        jobId = undefined;
    }

    jobId = (jobId || "").toString().trim();

    if(!jobId){
        if(callback){
            return callback(null, false);
        }else{
            return;
        }
    }

    this.redisClient.multi().
        select(this.db)["eval"](this.scripts.deleteJob.script, 4, this.prefix + "job." + jobId, this.prefix + "all", this.prefix + "unassigned", this.prefix + "worker.", jobId).
        exec(function(err, replies){
            if(!callback){
                return;
            }
            if(err){
                return callback(err);
            }
            return callback(null, jobId);
        });

};
