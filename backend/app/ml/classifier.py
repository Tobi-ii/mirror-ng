import pickle, os, logging
from typing import Optional

logger = logging.getLogger(__name__)
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'category_model.pkl')

# Seed training data — narration fragments mapped to categories
TRAINING_DATA = [
    ("data purchase", "Utilities"), ("airtime", "Utilities"), ("mtn", "Utilities"),
    ("glo", "Utilities"), ("airtel", "Utilities"), ("9mobile", "Utilities"),
    ("electricity", "Utilities"), ("dstv", "Utilities"), ("gotv", "Utilities"),
    ("netflix", "Entertainment"), ("spotify", "Entertainment"), ("showmax", "Entertainment"),
    ("transfer from", "Transfer"), ("transfer to", "Transfer"), ("onebank transfer", "Transfer"),
    ("nip", "Transfer"), ("banknip", "Transfer"), ("afb nip", "Transfer"),
    ("salary", "Income"), ("payroll", "Income"), ("wage", "Income"),
    ("uber", "Transport"), ("bolt", "Transport"), ("taxify", "Transport"), ("fuel", "Transport"),
    ("pos", "Shopping"), ("jumia", "Shopping"), ("konga", "Shopping"), ("market", "Shopping"),
    ("restaurant", "Food"), ("food", "Food"), ("eatery", "Food"), ("cafe", "Food"),
]

def train_classifier():
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import Pipeline

    texts = [t[0] for t in TRAINING_DATA]
    labels = [t[1] for t in TRAINING_DATA]

    pipeline = Pipeline([
        ('tfidf', TfidfVectorizer(analyzer='char_wb', ngram_range=(2, 4), max_features=1000)),
        ('clf', LogisticRegression(max_iter=500))
    ])
    pipeline.fit(texts, labels)

    with open(MODEL_PATH, 'wb') as f:
        pickle.dump(pipeline, f)

    logger.info(f"✅ NLP Classifier trained on {len(texts)} samples")
    return pipeline

def load_classifier():
    if os.path.exists(MODEL_PATH):
        with open(MODEL_PATH, 'rb') as f:
            return pickle.load(f)
    return train_classifier()

def predict_category(narration: str) -> str:
    try:
        clf = load_classifier()
        return clf.predict([narration.lower()])[0]
    except Exception as e:
        logger.error(f"Classifier error: {e}")
        return "General"

def retrain_with_feedback(narration: str, correct_category: str):
    """Call this when user corrects a category — incremental learning hook."""
    TRAINING_DATA.append((narration.lower(), correct_category))
    train_classifier()
    logger.info(f"♻️ Retrained with: '{narration}' → {correct_category}")