const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Job = require('../src/models/Job');
const JobWorker = require('../src/workers/jobWorker');

const { JOB_TYPES, JOB_STATUS } = Job;

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await Job.deleteMany({});
});

describe('Job Model', () => {
  describe('createJob', () => {
    it('should create a new job', async () => {
      const job = await Job.createJob({
        type: JOB_TYPES.EMAIL,
        payload: { test: 'data' },
        priority: 5
      });

      expect(job).toBeDefined();
      expect(job.type).toBe(JOB_TYPES.EMAIL);
      expect(job.status).toBe(JOB_STATUS.PENDING);
      expect(job.payload.test).toBe('data');
    });

    it('should be idempotent (same jobId returns existing job)', async () => {
      const job1 = await Job.createJob({
        jobId: 'test-job-1',
        type: JOB_TYPES.EMAIL,
        payload: { test: 'data' }
      });

      const job2 = await Job.createJob({
        jobId: 'test-job-1',
        type: JOB_TYPES.PUSH,
        payload: { different: 'data' }
      });

      expect(job1._id.toString()).toBe(job2._id.toString());
      expect(job2.type).toBe(JOB_TYPES.EMAIL); // Original data preserved
    });

    it('should generate unique jobId if not provided', async () => {
      const job1 = await Job.createJob({
        type: JOB_TYPES.EMAIL,
        payload: {}
      });

      const job2 = await Job.createJob({
        type: JOB_TYPES.EMAIL,
        payload: {}
      });

      expect(job1.jobId).not.toBe(job2.jobId);
    });
  });

  describe('claimNext', () => {
    it('should claim next pending job atomically', async () => {
      await Job.createJob({
        type: JOB_TYPES.EMAIL,
        payload: { test: 'data' },
        priority: 5
      });

      const claimed = await Job.claimNext([JOB_TYPES.EMAIL], 'worker-1');

      expect(claimed).toBeDefined();
      expect(claimed.status).toBe(JOB_STATUS.PROCESSING);
      expect(claimed.processedBy).toBe('worker-1');
      expect(claimed.attempts).toBe(1);
    });

    it('should not claim already processing job', async () => {
      await Job.createJob({
        type: JOB_TYPES.EMAIL,
        payload: { test: 'data' }
      });

      const claim1 = await Job.claimNext([JOB_TYPES.EMAIL], 'worker-1');
      const claim2 = await Job.claimNext([JOB_TYPES.EMAIL], 'worker-2');

      expect(claim1).toBeDefined();
      expect(claim2).toBeNull();
    });

    it('should respect priority order', async () => {
      await Job.createJob({
        jobId: 'low-priority',
        type: JOB_TYPES.EMAIL,
        payload: {},
        priority: 2
      });

      await Job.createJob({
        jobId: 'high-priority',
        type: JOB_TYPES.EMAIL,
        payload: {},
        priority: 8
      });

      const claimed = await Job.claimNext([JOB_TYPES.EMAIL], 'worker-1');

      expect(claimed.jobId).toBe('high-priority');
    });

    it('should respect scheduledFor', async () => {
      const futureDate = new Date(Date.now() + 60000); // 1 minute future

      await Job.createJob({
        type: JOB_TYPES.EMAIL,
        payload: {},
        scheduledFor: futureDate
      });

      const claimed = await Job.claimNext([JOB_TYPES.EMAIL], 'worker-1');

      expect(claimed).toBeNull();
    });
  });

  describe('markCompleted', () => {
    it('should mark job as completed', async () => {
      const job = await Job.createJob({
        jobId: 'test-complete',
        type: JOB_TYPES.EMAIL,
        payload: {}
      });

      await Job.claimNext([JOB_TYPES.EMAIL], 'worker-1');
      await Job.markCompleted('test-complete');

      const updated = await Job.findOne({ jobId: 'test-complete' });
      expect(updated.status).toBe(JOB_STATUS.COMPLETED);
      expect(updated.processedAt).toBeDefined();
    });
  });

  describe('markFailed', () => {
    it('should mark job as failed and schedule retry', async () => {
      const job = await Job.createJob({
        jobId: 'test-fail',
        type: JOB_TYPES.EMAIL,
        payload: {},
        maxAttempts: 3
      });

      await Job.claimNext([JOB_TYPES.EMAIL], 'worker-1');

      const error = new Error('Test error');
      await Job.markFailed('test-fail', error);

      const updated = await Job.findOne({ jobId: 'test-fail' });
      expect(updated.status).toBe(JOB_STATUS.FAILED);
      expect(updated.lastError).toBe('Test error');
      expect(updated.errorHistory).toHaveLength(1);
      expect(updated.scheduledFor.getTime()).toBeGreaterThan(Date.now());
    });

    it('should move to dead letter queue after max retries', async () => {
      const job = await Job.createJob({
        jobId: 'test-dead',
        type: JOB_TYPES.EMAIL,
        payload: {},
        maxAttempts: 2
      });

      // First attempt
      await Job.claimNext([JOB_TYPES.EMAIL], 'worker-1');
      await Job.markFailed('test-dead', new Error('Attempt 1'));

      // Second attempt
      await Job.findOneAndUpdate(
        { jobId: 'test-dead' },
        { status: JOB_STATUS.PENDING, scheduledFor: new Date() }
      );
      await Job.claimNext([JOB_TYPES.EMAIL], 'worker-1');
      await Job.markFailed('test-dead', new Error('Attempt 2'));

      const updated = await Job.findOne({ jobId: 'test-dead' });
      expect(updated.status).toBe(JOB_STATUS.DEAD);
      expect(updated.errorHistory).toHaveLength(2);
    });
  });

  describe('getStats', () => {
    it('should return job statistics', async () => {
      await Job.createJob({ type: JOB_TYPES.EMAIL, payload: {} });
      await Job.createJob({
        type: JOB_TYPES.PUSH,
        payload: {},
        status: JOB_STATUS.COMPLETED
      });
      await Job.createJob({
        type: JOB_TYPES.SMS,
        payload: {},
        status: JOB_STATUS.FAILED
      });

      const stats = await Job.getStats();

      expect(stats.total).toBe(3);
      expect(stats.pending).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
    });
  });

  describe('resetStuckJobs', () => {
    it('should reset jobs stuck in processing', async () => {
      const job = await Job.createJob({
        type: JOB_TYPES.EMAIL,
        payload: {}
      });

      // Claim job
      await Job.claimNext([JOB_TYPES.EMAIL], 'worker-1');

      // Simulate old processing start time
      await Job.findOneAndUpdate(
        { _id: job._id },
        { processingStartedAt: new Date(Date.now() - 60 * 60 * 1000) } // 1 hour ago
      );

      const resetCount = await Job.resetStuckJobs(30); // 30 minute threshold

      expect(resetCount).toBe(1);

      const updated = await Job.findById(job._id);
      expect(updated.status).toBe(JOB_STATUS.FAILED);
    });
  });
});

describe('JobWorker', () => {
  let worker;
  let handlerCalled = false;

  beforeEach(() => {
    handlerCalled = false;
    worker = new JobWorker({
      workerId: 'test-worker',
      concurrency: 2,
      pollInterval: 100
    });
  });

  afterEach(async () => {
    if (worker.running) {
      await worker.stop();
    }
  });

  it('should register handlers', () => {
    const handler = jest.fn();
    worker.registerHandler(JOB_TYPES.EMAIL, handler);

    expect(worker.handlers.has(JOB_TYPES.EMAIL)).toBe(true);
  });

  it('should process a job', async () => {
    const mockHandler = jest.fn(async (payload) => {
      expect(payload.test).toBe('data');
    });

    worker.registerHandler(JOB_TYPES.EMAIL, mockHandler);

    await Job.createJob({
      type: JOB_TYPES.EMAIL,
      payload: { test: 'data' }
    });

    await worker.start();

    // Wait for job to be processed
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(mockHandler).toHaveBeenCalled();
    expect(worker.stats.processed).toBeGreaterThan(0);

    await worker.stop();
  });

  it('should retry failed jobs', async () => {
    let attemptCount = 0;

    const mockHandler = jest.fn(async () => {
      attemptCount++;
      if (attemptCount < 2) {
        throw new Error('Simulated failure');
      }
      // Success on second attempt
    });

    worker.registerHandler(JOB_TYPES.EMAIL, mockHandler);

    await Job.createJob({
      jobId: 'test-retry',
      type: JOB_TYPES.EMAIL,
      payload: {},
      maxAttempts: 3
    });

    await worker.start();

    // Wait for initial attempt and retry
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Manually reset scheduledFor to trigger immediate retry (simulate backoff passing)
    await Job.findOneAndUpdate({ jobId: 'test-retry' }, { scheduledFor: new Date() });

    // Wait for retry
    await new Promise((resolve) => setTimeout(resolve, 300));

    await worker.stop();

    expect(attemptCount).toBeGreaterThanOrEqual(2);
  });

  it('should respect concurrency limit', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const slowHandler = async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 200));
      concurrent--;
    };

    worker.registerHandler(JOB_TYPES.EMAIL, slowHandler);

    // Create 5 jobs
    for (let i = 0; i < 5; i++) {
      await Job.createJob({
        type: JOB_TYPES.EMAIL,
        payload: { id: i }
      });
    }

    await worker.start();
    await new Promise((resolve) => setTimeout(resolve, 400));
    await worker.stop();

    expect(maxConcurrent).toBeLessThanOrEqual(worker.concurrency);
  });

  it('should handle idempotent job execution', async () => {
    let executionCount = 0;

    const idempotentHandler = async (payload) => {
      executionCount++;
      // Simulate idempotent operation (e.g., upsert)
    };

    worker.registerHandler(JOB_TYPES.EMAIL, idempotentHandler);

    // Create same job twice (idempotency test)
    await Job.createJob({
      jobId: 'idempotent-job',
      type: JOB_TYPES.EMAIL,
      payload: {}
    });

    await Job.createJob({
      jobId: 'idempotent-job',
      type: JOB_TYPES.EMAIL,
      payload: {}
    });

    await worker.start();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await worker.stop();

    // Should only execute once (same jobId)
    expect(executionCount).toBe(1);
  });
});

describe('Job Queue Integration', () => {
  it('should handle complete workflow: create -> claim -> process -> complete', async () => {
    const job = await Job.createJob({
      jobId: 'workflow-test',
      type: JOB_TYPES.EMAIL,
      payload: { userId: '123', message: 'Test' },
      priority: 5
    });

    expect(job.status).toBe(JOB_STATUS.PENDING);

    // Worker claims job
    const claimed = await Job.claimNext([JOB_TYPES.EMAIL], 'worker-1');
    expect(claimed.jobId).toBe('workflow-test');
    expect(claimed.status).toBe(JOB_STATUS.PROCESSING);

    // Simulate job processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Mark complete
    await Job.markCompleted('workflow-test');

    const completed = await Job.findOne({ jobId: 'workflow-test' });
    expect(completed.status).toBe(JOB_STATUS.COMPLETED);
  });

  it('should survive server restart (job persistence)', async () => {
    await Job.createJob({
      jobId: 'persistent-job',
      type: JOB_TYPES.EMAIL,
      payload: { test: 'data' }
    });

    // Simulate server restart (disconnect and reconnect)
    await mongoose.disconnect();
    await mongoose.connect(mongoServer.getUri());

    const job = await Job.findOne({ jobId: 'persistent-job' });
    expect(job).toBeDefined();
    expect(job.status).toBe(JOB_STATUS.PENDING);
  });
});
