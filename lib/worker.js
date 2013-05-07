/*jshint evil:true */

var redis = require("redis"),
    crypto = require("crypto"),
    fs = require("fs"),
    EventEmitter = require("events").EventEmitter,
    util = require("util"),
    Job = require("./job");

module.exports.createWorker = function(assemblageId, config){
    return new Worker(assemblageId, config);
};

function Worker(assemblageId, config){
    EventEmitter.call(this);

    this.type = "worker";

    this.assemblageId = (assemblageId || "").toString().trim();
    this.id = crypto.randomBytes(10).toString("hex");

    this.running = true;

    this.config = config || {};

    this.redisClient = this.config.client || redis.createClient(this.config.port, this.config.host);

    this.prefix = this.config.prefix || this.assemblageId || "";
    if(this.prefix.length){
        this.prefix += ".";
    }

    this.db = (Math.abs(Number(this.config.db) || 0)) % 16;

    this.expireDelay = this.config.expireDelay || 60 * 1000;

    this.scripts = {};
    this.jobs = {};

    this.startPeriodicalJobs();
}
util.inherits(Worker, EventEmitter);

Worker.prototype.startPeriodicalJobs = function(){

    this.createWorkerLock((function(err){
        if(err){
            this.emit("error", err);
        }
        if(this.running){
            this.updateLockTimer = setTimeout(this.updateLock.bind(this), 100);
            this.checkAddedJobsTimer = setTimeout(this.checkAddedJobs.bind(this), 300);
            this.checkDeletedJobTimer = setTimeout(this.checkDeletedJobs.bind(this), 300);
        }
    }).bind(this));
};

Worker.prototype.stopPeriodicalJobs = function(){
    clearTimeout(this.updateLockTimer);
    clearTimeout(this.checkAddedJobsTimer);
    clearTimeout(this.checkDeletedJobTimer);
};

Worker.prototype.scriptLoader = function(scriptName, callback){
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
};

Worker.prototype.updateLock = function(){
    this.redisClient.multi().
        select(this.db).
        zscore(this.prefix + "locks", this.id).
        zadd(this.prefix + "locks", Date.now(), this.id).
        exec((function(err, replies){
            if(replies && replies[1] && Number(replies[1]) && Number(replies[1]) < Date.now() - this.expireDelay){
                this.redisClient.multi().
                    select(this.db).
                    zrem(this.prefix + "locks", this.id).
                    exec((function(){
                        this.terminate();
                        this.emit("error", new Error("Expired lock, can't update"));
                    }).bind(this));
            }else if(this.running){
                this.updateLockTimer = setTimeout(this.updateLock.bind(this), 100);
            }
        }).bind(this));
};

Worker.prototype.checkAddedJobs = function(){
    if(!this.scripts.checkAddedJobs || !this.scripts.checkAddedJobs.script){
        return this.scriptLoader("checkAddedJobs", this.checkAddedJobs.bind(this));
    }
    this.redisClient.multi().
        select(this.db)["eval"](this.scripts.checkAddedJobs.script, 3, this.prefix + "worker." + this.id + ".waiting", this.prefix + "worker." + this.id + ".accepted", this.prefix + "job.", this.id).
        exec((function(err, replies){

            var addedJobs = replies && replies[1] || [];

            var processAddedJobs = function(){
                if(!addedJobs.length){
                    if(this.running){
                        this.checkAddedJobsTimer = setTimeout(this.checkAddedJobs.bind(this), 300);
                    }
                    return;
                }

                var jobId = addedJobs.shift();

                if(!jobId){
                    return processAddedJobs.call(this);
                }

                this.redisClient.multi().
                    select(this.db).
                    hget(this.prefix + "job." + jobId, "_payload").
                    exec((function(err, replies){
                        var payload = {};
                        if(!err && replies && replies[1]){
                            try{
                                payload = JSON.parse(replies[1]);
                            }catch(E){}
                        }

                        var job = new Job(jobId, payload, this);
                        this.jobs[jobId] = job;

                        this.emit("add", job);

                        processAddedJobs.call(this);
                    }).bind(this));
            };

            processAddedJobs.call(this);

        }).bind(this));
};

Worker.prototype.checkDeletedJobs = function(){
    if(!this.scripts.checkDeletedJobs || !this.scripts.checkDeletedJobs.script){
        return this.scriptLoader("checkDeletedJobs", this.checkDeletedJobs.bind(this));
    }

    this.redisClient.multi().
        select(this.db)["eval"](this.scripts.checkDeletedJobs.script,
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
                    if(this.jobs[jobId]){
                        var job = this.jobs[jobId];
                        delete this.jobs[jobId];
                        job.emit("delete");
                    }else{
                        this.emit("delete", jobId);
                    }
                }).bind(this));
            }
            if(this.running){
                this.checkDeletedJobTimer = setTimeout(this.checkDeletedJobs.bind(this), 300);
            }

        }).bind(this));
};

Worker.prototype.queueDeleteJob = function(jobId, callback){
    if(!this.scripts.queueDeleteJob || !this.scripts.queueDeleteJob.script){
        return this.scriptLoader("queueDeleteJob", this.queueDeleteJob.bind(this, jobId, callback));
    }

    this.redisClient.multi().
        select(this.db)["eval"](this.scripts.queueDeleteJob.script,
            2,
            this.prefix + "worker." + this.id + ".delete",
            this.prefix + "job." + jobId,
            this.id,
            jobId).
        exec(callback);
};

Worker.prototype.terminate = function(callback){
    if(!this.running){
        if(callback){
            callback(new Error("Already stopped"));
        }
        return;
    }

    this.running = false;

    this.stopPeriodicalJobs();

    Object.keys(this.jobs).forEach((function(key){
        if(this.jobs[key]){
            this.jobs[key].emit("delete");
        }
    }).bind(this));

    this.jobs = {};

    this.redisClient.multi().
        select(this.db).
        zadd(this.prefix + "locks", 1, this.id).
        exec((function(err){
            this.emit("close");
            this.redisClient.end();
            if(callback){
                callback(err);
            }
        }).bind(this));
};
