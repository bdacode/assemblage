--[[

periodically checks new jobs list and adds this to assigned jobs list
(
JOB_ID = rpoplpush worker.WORKER_ID.waiting worker.WORKER_ID.accepted;
hset job.JOB_ID _status accepted
) (jobs hash: _status=accepted).
emits new job this.emit("job", job_id, job_data)

KEYS[1] = worker.worker_id.waiting
KEYS[1] = worker.worker_id.accepted
KEYS[2] = job_prefix
ARGV[1] = worker_id
]]--

local added = {};

while true do

    local job_id = redis.call('rpoplpush', KEYS[1], KEYS[2]);
    if not job_id or job_id == "" then
        return added;
    end;

    redis.call('hset', KEYS[3] .. job_id, '_status', 'accepted');

    table.insert(added, job_id);

end;
