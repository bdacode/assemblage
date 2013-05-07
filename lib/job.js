var EventEmitter = require("events").EventEmitter,
    util = require("util");

module.exports = Job;

function Job(jobId, payload, worker){
    EventEmitter.call(this);

    this.id = jobId;
    this.payload = payload || {};
    this.worker = worker;

}
util.inherits(Job, EventEmitter);

Job.prototype.deleteJob = function(callback){
    this.worker.queueDeleteJob(this.id, callback);
};
