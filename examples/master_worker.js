var assemblage = require("../index");

var master = assemblage.createMaster("mycluster");

master.addJob({_worker:"1234", key1:"fgdffg"}, function(err, jobId){
    if(err){
        throw err;
    }
    console.log("Created JOB %s", jobId);
});

var worker = assemblage.createWorker("mycluster");

worker.on("add", function(job){

    console.log("NEW JOB FOR " + this.id + ": " + job.id);
    console.log(job.payload);

    job.once("delete", function(){
        console.log("REMOVE JOB FROM " + this.id + ": " + job.id);
    });

    setTimeout(job.deleteJob.bind(job, function(err){
        console.log("Job queued for complete removal");
    }), 1500);

});

setTimeout(worker.terminate.bind(worker), 3000);

worker.on("close", function(){
   console.log("The worker was closed, no new jobs");
   setTimeout(process.exit, 100);
});
