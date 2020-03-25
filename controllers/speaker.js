const speakerService = require('../services/speaker');

function getSpeakers(req, res){
  speakerService.getAll()
  .then(data => {
    const itemsPage = Math.ceil(data.length / 10);
    const total = itemsPage;
    const display = (itemsPage < 5) ? itemsPage : 5;
    const lastDate = parseInt(10) * parseInt(1);
    const firstDate = parseInt(lastDate) * parseInt(1 - 1) / 1;
    const currentRes = {
      speakers: data.slice(firstDate, lastDate),
      itemsPagination: data,
      total,
      display
    };
    res.send(currentRes);
  });
};

function getSpeakerId(req, res){
  speakerService.getById(req.params.id)
.then(data => res.send(data));
}

function newSpeaker(req, res) {
  speakerService.add({
    name: req.body.name,
    email: req.body.email,
    title: req.body.title,
    abstract: req.body.abstract,
    biography: req.body.biography,
  })
  .then(data => res.send(data));
}

function updateSpeaker(req, res) {
  speakerService.updateSpeaker(req.body, { where: { id: req.params.id }})
  .then(data => res.send(data));
}

function deleteSpeaker(req, res) {
  speakerService.deleteSpeaker(req.body.id)
  .then(() => res.send({ success: true }))
}

module.exports = {
  getSpeakers,
  newSpeaker,
  updateSpeaker,
  getSpeakerId,
  deleteSpeaker,
}