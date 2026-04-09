from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from datetime import date, datetime, timedelta
from models import db, Employee, AttendanceRecord

admin_bp = Blueprint('admin', __name__, url_prefix='/api/admin')

IST_OFFSET = timedelta(hours=5, minutes=30)


def ist_today():
    return (datetime.utcnow() + IST_OFFSET).date()

def is_admin():
    claims = get_jwt()
    return claims.get('role') == 'admin'

@admin_bp.route('/records', methods=['GET'])
@jwt_required()
def get_all_records():
    if not is_admin():
        return jsonify({"error": "Admin access required"}), 403
        
    date_param = request.args.get('date')
    department_param = request.args.get('department')
    
    query = db.session.query(AttendanceRecord, Employee).join(Employee)
    
    if date_param:
        try:
            target_date = date.fromisoformat(date_param)
            query = query.filter(AttendanceRecord.date == target_date)
        except ValueError:
            return jsonify({"error": "Invalid date format, use YYYY-MM-DD"}), 400
            
    if department_param:
        query = query.filter(Employee.department == department_param)
        
    results = query.all()
    
    return jsonify([{
        "id": rec.id,
        "employee_name": emp.name,
        "employee_department": emp.department,
        "date": rec.date.isoformat(),
        "check_in_time": rec.check_in_time.isoformat(),
        "check_out_time": rec.check_out_time.isoformat() if rec.check_out_time else None,
        "status": rec.status
    } for rec, emp in results])

@admin_bp.route('/employees', methods=['GET'])
@jwt_required()
def get_all_employees():
    if not is_admin():
        return jsonify({"error": "Admin access required"}), 403
        
    employees = Employee.query.all()
    return jsonify([{
        "id": e.id,
        "name": e.name,
        "email": e.email,
        "department": e.department,
        "role": e.role,
        "created_at": e.created_at.isoformat()
    } for e in employees])

@admin_bp.route('/summary', methods=['GET'])
@jwt_required()
def get_summary():
    if not is_admin():
        return jsonify({"error": "Admin access required"}), 403
        
    today = ist_today()
    
    total_employees = Employee.query.count()
    present = AttendanceRecord.query.filter_by(date=today, status='present').count()
    checked_out = AttendanceRecord.query.filter_by(date=today, status='checked-out').count()
    
    # Total who showed up today (present or checked-out)
    total_present_today = AttendanceRecord.query.filter_by(date=today).count()
    
    # Breakdown based on requested logic
    # total_employees: count of all employees
    # present: count checked in today (any record today)
    # checked_out: count with check_out_time today
    # still_in: total present today - checked_out
    # absent: total - present
    
    return jsonify({
        "total_employees": total_employees,
        "present": total_present_today,
        "checked_out": checked_out,
        "still_in": total_present_today - checked_out,
        "absent": total_employees - total_present_today
    })
