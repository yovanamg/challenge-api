const EventUser = require('../models').EventUser;

const getAll = body => EventUser.findAll({
  where: { event_id: body.eventId },
  where: { user_id: body.userId },
});
const add = eventUser => EventUser.create(eventUser);
const updateEventUser = eventUser => EventUser.update(eventUser, { where: { id: eventUser.id }});
module.exports = { getAll, add, updateEventUser };