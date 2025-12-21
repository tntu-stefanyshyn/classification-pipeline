# AWS jobs (Python)

Міні-воркспейс для ML задач класифікації, сумісний з AWS оточенням.

## Швидкий старт

1. Створити віртуальне оточення у каталозі `aws-jobs` (наприклад, `python -m venv .venv && source .venv/bin/activate`).
2. Встановити залежності: `pip install -e .[dev]`.
3. Використати `aws_jobs.classification_job.TabularClassifier` для тренування моделі.

### Приклад

```python
import pandas as pd
from pathlib import Path
from aws_jobs.classification_job import ClassificationJobConfig, TabularClassifier

df = pd.read_csv("data.csv")
cfg = ClassificationJobConfig(target_column="label", output_dir=Path("artifacts"))
report = TabularClassifier(cfg).train(df)
print(report)
```
