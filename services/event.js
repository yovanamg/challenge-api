const Events = require('../models').Event;
const EventUser = require('../models').EventUser;

const getAll = body => Events.findAll({
  include: [{
    model: EventUser,
    as: 'events_users',
    foreignKey: 'id',
  } ],
  order: [
    ['id', 'DESC']
  ],
}
);
const getById = id => Events.findById(id);
const add = event => Events.create(event);
const updateEvent = event => Events.update(event, { where: { id: event.id }});
const deleteEvent = id => Events.destroy({ where: { id: parseInt(id) } });
module.exports = { getAll, add, updateEvent, getById, deleteEvent };