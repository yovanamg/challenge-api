const Users = require('../models').User;

const getAll = () => Users.findAll(
  {
    where: { 
      estatus: true
    },
    order: [
      ['id', 'ASC']
    ],
  }
);
const getByEmail = email => Users.findAll({ where: { email } });
const addUser = user => Users.create(user);
const getUserByLogin = email => Users.findOne({ where: { email } });
const updateUser = updateUser => Users.update(updateUser, { where: { id: updateUser.id }});

module.exports = {
  getAll,
  addUser,
  getUserByLogin,
  updateUser,
  getByEmail,
}