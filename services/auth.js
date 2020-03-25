const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Users = require('../models').User;
const config =  require('../config');

const authenticate = params => {
  return Users.findOne({
    where: {
      email: params.email,
    },
  }).then(user => {
    if (!user)
      throw new Error('Authentication failed. User not found.');
    if (!bcrypt.compareSync(params.password.trim() || '', user.password.trim()))
       throw new Error('Authentication failed. Wrong password.');
    const payload = {
      email: user.email.trim(),
      id: user.id,
      rol: user.rol.trim(),
      time: new Date(),
    };
    var token = {
      token: jwt.sign(payload, config.jwtSecret, {
        expiresIn: config.tokenExpireTime
      }),
      payload,
    };
    return token;

  })
};

module.exports = {
  authenticate,
}