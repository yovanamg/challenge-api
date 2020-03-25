const eventUserService = require('../services/event_user');

function getEventUser(req, res){
  const body = {
    event_id: req.params.eventId,
    user_id: req.params.userId,
  }
  eventUserService.getAll(body)
  .then(data => res.send(data));
};

function newEventUser(req, res) {
  eventUserService.add({
    event_id: req.body.event_id, 
    user_id: req.body.user_id,
    attendance: req.body.attendance,
  })
  .then(data => res.send(data));
}

function updateEventUser(req, res) {
  eventUserService.updateEventUser(req.body, { where: { id: req.params.id }})
  .then(data => res.send(data));
}

module.exports = {
  getEventUser,
  newEventUser,
  updateEventUser,
}