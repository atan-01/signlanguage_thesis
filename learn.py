from flask import Blueprint, render_template, session, redirect, url_for, current_app

learn_bp = Blueprint('learn', __name__, url_prefix='/learn')

def get_user_by_id(user_id):
    """Get user by ID from Supabase"""
    supabase = current_app.config['SUPABASE']
    try:
        result = supabase.table('users').select('*').eq('id', user_id).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        print(f"Error getting user by ID: {e}")
        return None

@learn_bp.route('/')
def learn():
    user_id = session.get('user_id')
    if not user_id:
        return redirect(url_for('auth.index'))
    
    user_data = get_user_by_id(user_id)
    if not user_data: 
        return redirect(url_for('auth.index'))

    return render_template('learn.html')

@learn_bp.route('/<category>')
def learn_category(category):
    user_id = session.get('user_id')
    if not user_id:
        return redirect(url_for('auth.index'))
    
    user_data = get_user_by_id(user_id)
    if not user_data: 
        return redirect(url_for('auth.index'))

    valid_categories = ['alphabet', 'number', 'words']
    if category not in valid_categories:
        return "Page not found", 404

    supabase = current_app.config['SUPABASE']
    try:
        # Fixed: separate order() calls instead of comma-separated
        response = supabase.table("learning_materials") \
            .select('class, instruction, image_path, subcategory') \
            .eq("category", category) \
            .order("subcategory") \
            .order("class") \
            .execute()
        
        print(f"Raw response for {category}: {response.data}")  # Debug print
        
        if category == 'words':
            # Group items by subcategory
            subcategories = {}
            for row in response.data:
                subcat = row.get("subcategory", "Other")
                if subcat not in subcategories:
                    subcategories[subcat] = []
                subcategories[subcat].append({
                    "class": row["class"],
                    "instruction": row["instruction"],
                    "image_path": row["image_path"]
                })
            items = subcategories
        else:
            items = [
                {
                    "class": row["class"], 
                    "instruction": row["instruction"], 
                    "image_path": row["image_path"]
                } 
                for row in response.data
            ]
        
        print(f"Processed items for {category}: {items}")  # Debug print
        
    except Exception as e:
        print(f"Error fetching learning materials: {e}")
        import traceback
        traceback.print_exc()  # Print full error traceback
        items = [] if category != 'words' else {}

    return render_template('learning_materials.html', category=category, items=items)