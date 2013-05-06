--[[

periodically checks unassigned job list and tries to assign these to a worker with
lower work count (WORKER_ID = zrange workers 0 0 [0]), moves job from unassigned to
worker waiting list (JOB_ID = rpoplpush unassigned worker.WORKER_ID.waiting;
hmset job.JOB_ID _worker WORKER_ID _status waiting) (job hash: _worker=worker_id, _status=waiting),
increments worker work count by 1 (zincrby workers 1 WORKER_ID)

KEYS[1] = workers
KEYS[2] = unassigned
KEYS[3] = worker_prefix
KEYS[4] = job_prefix

]]--

local assigned = 0;

while true do

    local worker_id = redis.call('zrange', KEYS[1], 0, 0)[1];
    if not worker_id then
        return assigned;
    end

    local job_id = redis.call('rpoplpush', KEYS[2], KEYS[3] .. worker_id .. ".waiting")
    if not job_id then
        return assigned;
    end

    if redis.call('hget', KEYS[4] .. job_id, '_action') == 'delete' then
        redis.call('lrem', KEYS[3] .. worker_id .. ".waiting", 0, job_id);
        redis.call('del', KEYS[4] .. job_id);
    else
        redis.call('hmset', KEYS[4] .. job_id, '_worker', worker_id, '_status', 'waiting');
        redis.call('zincrby', KEYS[1], 1, worker_id);

        assigned = assigned + 1;
    end;



end;
