const usersService = require('../services/user');
const config =  require('../config');
const bcrypt = require('bcryptjs');

function getUsers(req, res) {
  usersService.getAll()
  .then(data => res.send(data));
};

function updateUser(req, res) {
  const body = req.body;
  if(body.password) {
    body.password = bcrypt.hashSync(body.password, config.saltRounds);
  }
  usersService.getByUsername(body.username)
  .then(data => {
    if(data.length === 0 || data[0].id === body.id) {
      usersService.updateUser(body, { where: { id: req.params.id }})
      .then(data => res.send(data));
    } else {
      return res.status(404).send('Nombre duplicado.')
    }
  });
};

module.exports = {
  getUsers,
  updateUser,
}