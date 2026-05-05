// Models/Worker.js
class Worker {
  constructor(body) {
    this.name = body.name;
    this.iqamaNumber = body.iqamaNumber;
    this.supplier = body.supplier || null;
    this.position = body.position || null;
    this.phone = body.phone || null;
    this.dateJoined = body.dateJoined || null;
    this.leaveDate = body.leaveDate || null;
       this.roomNumber = body.roomNumber;
  }
}

module.exports = Worker;



