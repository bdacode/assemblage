

module.exports.createMaster = require("./lib/master").createMaster;
module.exports.createWorker = require("./lib/worker").createWorker;



var master = module.exports.createMaster("mycluster");
//master.addJob('c8cb27c6b7599bbed16b', console.log)
//master.addJob('c8cb27c6b7599bbed16f', {_worker:"1234", key1:"fgdffg"}, console.log)
//master.addJob('c8cb27c6b7599bbed16b', console.log)

setTimeout(function(){
//    master.deleteJob('c8cb27c6b7599bbed16b', console.log)
}, 1500)
/*
var worker = module.exports.createWorker("mycluster");
worker.on("add", function(jobId){
    console.log("NEW JOB FOR " + this.id + ": " + jobId);
});

worker.on("delete", function(jobId){
    console.log("DELETE JOB FROM " + this.id + ": " + jobId);
});
*/
