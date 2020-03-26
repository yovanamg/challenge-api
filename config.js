module.exports = {
  port: 3001,
  dbConnectionString: {
    username: 'yovanamata',
    password: '123456',
    database: 'challenge',
    host: '34.70.218.175',
    dialect: 'postgres',
  },
  saltRounds: 6,
  jwtSecret: 'yo-its-a-secret',
  tokenExpireTime: '6h'
}