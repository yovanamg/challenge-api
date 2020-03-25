const Sequelize = require('sequelize');
const sequelize = require('../db');

const User = sequelize.define('users', {
  username: Sequelize.STRING,
  email: Sequelize.STRING,
  password: Sequelize.STRING,
  createdAt: Sequelize.DATE,
  updatedAt: Sequelize.DATE,
  rol: Sequelize.STRING,
});

const Event = sequelize.define('events', {
  theme: Sequelize.STRING,
  date: Sequelize.STRING,
  schedule: Sequelize.STRING,
  direction: Sequelize.STRING,
  createdAt: Sequelize.DATE,
  updatedAt: Sequelize.DATE,
});

const EventUser = sequelize.define('events_users', {
  event_id: Sequelize.INTEGER,
  user_id: Sequelize.INTEGER,
  attendance: Sequelize.BOOLEAN,
})
EventUser.removeAttribute('id');
EventUser.removeAttribute('createdAt');
EventUser.removeAttribute('updatedAt');

EventUser.belongsTo(Event);
Event.hasMany(EventUser);


const Speaker = sequelize.define('speakers', {
  name: Sequelize.STRING,
  email: Sequelize.STRING,
  title: Sequelize.STRING,
  abstract: Sequelize.STRING,
  biography: Sequelize.STRING,
  createdAt: Sequelize.DATE,
  updatedAt: Sequelize.DATE,
});

module.exports = {
  User,
  Event,
  EventUser,
  Speaker,
}