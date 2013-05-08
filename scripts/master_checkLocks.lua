--[[
periodically checks locks, if lock timestamp is lower than treshold for a worker
(zrangebyscore locks 0 TIMESTAMP-TRESHOLD), unassignes all jobs from this worker (moves all jobs from
the worker waiting and accepted list to unassigned

(JOB_ID = rpoplpush worker.WORKER_ID.waiting unassigned;
JOB_ID = rpoplpush worker.WORKER_ID.accepted unassigned), updates job hash: _worker="", _status=queued
(hmset job.JOB_ID _worker "" _status queued);
deletes all lists for the worker (

del worker.WORKER_ID.waiting;
del worker.WORKER_ID.accepted;
del worker.WORKER_ID.delete;
zrem workers WORKER_ID;
zrem locks WORKER_ID

)).
if job hash _action=delete (hget job.JOB_ID _action == "delete"), remove job hash and from all
list (lrem unassigned 0 JOB_ID; DEL job.JOB_ID)

KEYS[1] = locks
KEYS[2] = unassigned
KEYS[3] = worker_prefix
KEYS[4] = job_prefix
KEYS[5] = workers

ARGV[1] = TRESHOLD

]]--


local expired = redis.call('zrangebyscore', KEYS[1], 0 , ARGV[1])
if not expired or # expired == 0 then
    return 0;
end;

for i = 1, # expired do
    local worker_id = expired[i];

    while true do
        local job_id = redis.call('rpoplpush', KEYS[3] .. worker_id .. ".waiting", KEYS[2]);
        if not job_id then
            break;
        end;
        redis.call('hset', KEYS[4] .. job_id, '_worker', '');
        redis.call('hset', KEYS[4] .. job_id, '_status', 'queued');
    end;

    while true do
        local job_id = redis.call('rpoplpush', KEYS[3] .. worker_id .. ".accepted", KEYS[2]);
        if not job_id then
            break;
        end;
        redis.call('hset', KEYS[4] .. job_id, '_worker', '');
        redis.call('hset', KEYS[4] .. job_id, '_status', 'queued');
    end;

    redis.call('del', KEYS[3] .. worker_id .. ".waiting");
    redis.call('del', KEYS[3] .. worker_id .. ".accepted");
    redis.call('del', KEYS[3] .. worker_id .. ".delete");

    redis.call('zrem', KEYS[5], worker_id);
    redis.call('zrem', KEYS[1], worker_id);
end;


