from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timedelta
from models import db, AttendanceRecord

attendance_bp = Blueprint('attendance', __name__, url_prefix='/api/attendance')

IST_OFFSET = timedelta(hours=5, minutes=30)


def ist_now():
    return datetime.utcnow() + IST_OFFSET


def ist_today():
    return ist_now().date()

@attendance_bp.route('/checkin', methods=['POST'])
@jwt_required()
def checkin():
    employee_id = int(get_jwt_identity())
    today = ist_today()
    
    # Check for existing open record today
    open_record = AttendanceRecord.query.filter_by(
        employee_id=employee_id, 
        date=today, 
        check_out_time=None
    ).first()
    
    if open_record:
        return jsonify({"error": "Already checked in"}), 400
        
    data = request.get_json()
    new_record = AttendanceRecord(
        employee_id=employee_id,
        date=today,
        check_in_time=ist_now(),
        check_in_lat=data.get('lat'),
        check_in_lng=data.get('lng'),
        check_in_address=data.get('address'),
        status='present'
    )
    
    db.session.add(new_record)
    db.session.commit()
    
    return jsonify({
        "id": new_record.id,
        "date": new_record.date.isoformat(),
        "check_in_time": new_record.check_in_time.isoformat(),
        "status": new_record.status
    }), 201

@attendance_bp.route('/checkout', methods=['POST'])
@jwt_required()
def checkout():
    employee_id = int(get_jwt_identity())
    today = ist_today()
    
    # Find today's open record
    record = AttendanceRecord.query.filter_by(
        employee_id=employee_id, 
        date=today, 
        check_out_time=None
    ).first()
    
    if not record:
        return jsonify({"error": "No active check-in found"}), 400
        
    data = request.get_json()
    record.check_out_time = ist_now()
    record.check_out_lat = data.get('lat')
    record.check_out_lng = data.get('lng')
    record.check_out_address = data.get('address')
    record.status = 'checked-out'
    
    db.session.commit()
    
    return jsonify({
        "id": record.id,
        "check_out_time": record.check_out_time.isoformat(),
        "status": record.status
    })

@attendance_bp.route('/today', methods=['GET'])
@jwt_required()
def get_today():
    employee_id = int(get_jwt_identity())
    today = ist_today()
    
    record = AttendanceRecord.query.filter_by(employee_id=employee_id, date=today).first()
    
    if not record:
        return jsonify({"record": None})
        
    return jsonify({
        "id": record.id,
        "date": record.date.isoformat(),
        "check_in_time": record.check_in_time.isoformat(),
        "check_out_time": record.check_out_time.isoformat() if record.check_out_time else None,
        "status": record.status
    })

@attendance_bp.route('/history', methods=['GET'])
@jwt_required()
def get_history():
    employee_id = int(get_jwt_identity())
    
    records = AttendanceRecord.query.filter_by(employee_id=employee_id)\
        .order_by(AttendanceRecord.date.desc())\
        .limit(30).all()
        
    return jsonify([{
        "id": r.id,
        "date": r.date.isoformat(),
        "check_in_time": r.check_in_time.isoformat(),
        "check_out_time": r.check_out_time.isoformat() if r.check_out_time else None,
        "status": r.status
    } for r in records])
