const config =  require('../config');
const bcrypt = require('bcryptjs');
const authService = require('../services/auth');
const userService = require('../services/user');


function login(req, res) {
  return authService.authenticate(req.body)
  .then(token => {
    res.send({
      success: true,
      data: { token },
    });
  })
  .catch(err => {
    res.status(404).send('Not found');
  })
};

function register(req, res) {
  return userService.getUserByLogin(req.body.email)
  .then(exists => {
    if (exists) {
      return res.status(404).send('Not found');
    } 
    var user = {
      email: req.body.email,
      password: bcrypt.hashSync(req.body.password, config.saltRounds),
      rol: 'Usuario',
    }
    return userService.addUser(user)
    .then( () => res.send({ success: true }) );
  });
};

module.exports = {
  login,
  register,
}