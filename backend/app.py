import os
from flask import Flask, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from dotenv import load_dotenv
from models import db

# Load environment variables
load_dotenv()

app = Flask(__name__)

# Configure app from .env
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY')

# Initialize extensions
db.init_app(app)
JWTManager(app)
CORS(app)

# Import and register blueprints
from routes.auth import auth_bp
from routes.attendance import attendance_bp
from routes.admin import admin_bp
app.register_blueprint(auth_bp)
app.register_blueprint(attendance_bp)
app.register_blueprint(admin_bp)

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok", "db": "connected"}), 200

@app.route('/dev/reset', methods=['DELETE'])
def dev_reset():
    from models import AttendanceRecord
    try:
        db.session.query(AttendanceRecord).delete()
        db.session.commit()
        return jsonify({"cleared": True}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
    
# Create database tables
with app.app_context():
    # Note: In a production app, use migrations (e.g. Flask-Migrate)
    # However, for setup purposes:
    db.create_all()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
