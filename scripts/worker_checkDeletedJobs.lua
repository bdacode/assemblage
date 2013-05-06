--[[

periodically checks remove jobs list (
JOB_ID = rpoplpush worker.WORKER_ID.delete unassigned
). removes from assigned and wait list (
lrem worker.WORKER_ID.accepted 0 JOB_ID;
lrem worker.WORKER_ID.waiting 0 JOB_ID
). decrements worker job count by 1 (
zincrby workers -1 WORKER_ID
). if job hash _action=delete, remove from all list, delete job hash (
hget job.JOB_ID _action == delete;
srem all JOB_ID;
lrem unassigned 0 JOB_ID;
del job.JOB_ID
). emits job removal this.emit("remove", job_id)

KEYS[1] = worker.worker_id.delete
KEYS[2] = worker.worker_id.waiting
KEYS[3] = worker.worker_id.accepted
KEYS[4] = workers
KEYS[5] = job_prefix
KEYS[6] = all
KEYS[7] = unassigned

ARGV[1] = worker_id
]]--

local deleted = {};

while true do

    local job_id = redis.call('rpop', KEYS[1]);
    if not job_id or job_id == "" then
        return deleted;
    end;

    redis.call('lrem', KEYS[2], 0, job_id);
    redis.call('lrem', KEYS[3], 0, job_id);

    redis.call('zincrby', KEYS[4], -1, ARGV[1]);

    if redis.call('hget', KEYS[5] .. job_id, '_action') == "delete" then
        redis.call('srem', KEYS[6], job_id);
        redis.call('lrem', KEYS[7], 0, job_id);
        redis.call('del', KEYS[5] .. job_id);
    end;

    table.insert(deleted, job_id);

end;

