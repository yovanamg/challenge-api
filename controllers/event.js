const eventService = require('../services/event');

function getEvents(req, res){
  eventService.getAll()
  .then(data => {
    const itemsPage = Math.ceil(data.length / 10);
    const total = itemsPage;
    const display = (itemsPage < 5) ? itemsPage : 5;
    const lastDate = parseInt(10) * parseInt(1);
    const firstDate = parseInt(lastDate) * parseInt(1 - 1) / 1;
    const currentRes = {
      events: data.slice(firstDate, lastDate),
      itemsPagination: data,
      total,
      display
    };
    res.send(currentRes);
  });
};

function getEventId(req, res){
  eventService.getById(req.params.id)
.then(data => res.send(data));
}

function newEvent(req, res) {
  eventService.add({
    theme: req.body.theme,
    date: req.body.date,
    schedule: req.body.schedule,
    direction: req.body.direction,
    createdAt: req.body.createdAt,
    updatedAt: req.body.updatedAt,
  })
  .then(data => res.send(data));
}

function updateEvent(req, res) {
  eventService.updateEvent(req.body, { where: { id: req.params.id }})
  .then(data => res.send(data));
}

function deleteEvent(req, res) {
  eventService.deleteEvent(req.body.id)
  .then(() => res.send({ success: true }))
}

module.exports = {
  getEvents,
  newEvent,
  updateEvent,
  getEventId,
  deleteEvent,
}