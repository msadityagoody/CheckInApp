from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from models import db, Employee

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')
    department = data.get('department', 'Management')
    role = data.get('role', 'employee')

    if not all([name, email, password]):
        return jsonify({"error": "Missing required fields"}), 400

    if Employee.query.filter_by(email=email).first():
        return jsonify({"error": "Employee already exists"}), 400

    password_hash = generate_password_hash(password)
    new_employee = Employee(
        name=name,
        email=email,
        password_hash=password_hash,
        department=department,
        role=role
    )

    db.session.add(new_employee)
    db.session.commit()

    return jsonify({"message": "Employee registered", "employee_id": new_employee.id}), 201

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Missing payload"}), 400
    email = data.get('email')
    password = data.get('password')

    employee = Employee.query.filter_by(email=email).first()
    if not employee or not check_password_hash(employee.password_hash, password):
        return jsonify({"error": "Invalid credentials"}), 401

    additional_claims = {
        "name": employee.name,
        "email": employee.email,
        "role": employee.role,
        "department": employee.department
    }
    # Using employee.id as string identity as per common flask-jwt-extended practice
    access_token = create_access_token(identity=str(employee.id), additional_claims=additional_claims)
    
    return jsonify({"access_token": access_token}), 200

@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def me():
    employee_id = get_jwt_identity()
    employee = Employee.query.get(int(employee_id))
    if not employee:
        return jsonify({"error": "Employee not found"}), 404

    return jsonify({
        "id": employee.id,
        "name": employee.name,
        "email": employee.email,
        "role": employee.role,
        "department": employee.department,
        "created_at": employee.created_at.isoformat()
    }), 200
