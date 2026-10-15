if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to an isolated PostgreSQL test database before running integration checks.');
