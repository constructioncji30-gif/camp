 
// Staff Model (create Models/Staff.js)
const Staff = function(staff) {
  this.name = staff.name;
  this.roomNumber = staff.roomNumber;
  this.designation = staff.designation;
  this.phone = staff.phone || null;
  this.email = staff.email || null;
  this.department = staff.department || null;
  this.dateJoined = staff.dateJoined || null;
  this.leaveDate = staff.leaveDate || null;
};

module.exports = Staff;