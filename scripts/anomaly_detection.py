import pandas as pd
import numpy as np
import matplotlib.pyplot as plt


class SpendingAnomalyDetector:

    def __init__(
        self,
        elevated_threshold=1.5,
        potential_threshold=2.5,
        significant_threshold=3.5,
        minimum_difference=10,
        minimum_scale=5
    ):
        self.elevated_threshold = elevated_threshold
        self.potential_threshold = potential_threshold
        self.significant_threshold = significant_threshold
        self.minimum_difference = minimum_difference
        self.minimum_scale = minimum_scale

    # ---------------------------------------
    # 1. LOAD BANK STATEMENT
    # ---------------------------------------

    def load_data(self, filepath):

        df = pd.read_csv(
            filepath,
            skipinitialspace=True
        )

        required_columns = [
            "Date", "Type", "Description", "Value", "Balance"
        ]

        missing = set(required_columns) - set(df.columns)

        if missing:
            raise ValueError(
                f"Missing required columns: {missing}"
            )

        # Parse transaction dates
        df["Date"] = pd.to_datetime(
            df["Date"],
            format="%d %b %Y %H:%M",
            errors="coerce"
        )

        # Convert monetary values
        df["Value"] = pd.to_numeric(
            df["Value"],
            errors="coerce"
        )

        df = df.dropna(subset=["Date", "Value"])

        # Standardise transaction types
        df["Type"] = df["Type"].astype(str).str.strip()

        # Remove whitespace from descriptions
        df["Description"] = (
            df["Description"]
            .astype(str)
            .str.strip()
        )

        # Extract transaction date
        df["Transaction_Date"] = df["Date"].dt.normalize()

        # Negative transactions are outgoing
        df["Spending"] = np.where(
            df["Value"] < 0,
            abs(df["Value"]),
            0
        )

        # Positive transactions are incoming
        df["Income"] = np.where(
            df["Value"] > 0,
            df["Value"],
            0
        )

        # Identify recurring fixed payments
        df["Fixed_Expense"] = df["Type"].isin([
            "D/D",
            "S/O"
        ])

        # Variable expenditure excludes fixed payments
        df["Variable_Spending"] = np.where(
            (df["Value"] < 0) &
            (~df["Fixed_Expense"]),
            abs(df["Value"]),
            0
        )

        return df

    # ---------------------------------------
    # 2. AGGREGATE DAILY SPENDING
    # ---------------------------------------

    def aggregate_daily_spending(self, df):

        daily = df.groupby("Transaction_Date").agg(

            Total_Spending=("Spending", "sum"),

            Variable_Spending=("Variable_Spending", "sum"),

            Fixed_Expenses=("Fixed_Expense", "sum"),

            Income=("Income", "sum"),

        )

        # Include dates with no transactions
        date_range = pd.date_range(
            daily.index.min(),
            daily.index.max(),
            freq="D"
        )

        daily = daily.reindex(
            date_range,
            fill_value=0
        )

        daily.index.name = "Date"

        daily["Day_Of_Week"] = daily.index.dayofweek

        daily = daily.reset_index()

        return daily

    # ---------------------------------------
    # 3. CALCULATE PERSONAL BASELINE
    # ---------------------------------------

    def calculate_baseline(self, daily):

        daily = daily.copy()

        daily["Baseline"] = np.nan
        daily["MAD"] = np.nan

        for i, row in daily.iterrows():

            current_date = row["Date"]

            # Only use previous observations
            history = daily[
                daily["Date"] < current_date
            ]

            # Match the same weekday
            weekday_history = history[
                history["Day_Of_Week"] ==
                row["Day_Of_Week"]
            ]["Variable_Spending"]

            # Prefer weekday-specific history
            if len(weekday_history) >= 4:

                values = weekday_history.tail(13)

            else:

                # Fallback to previous 28 days
                values = history.tail(28)[
                    "Variable_Spending"
                ]

            if len(values) < 7:
                continue

            baseline = values.median()

            mad = np.median(
                np.abs(values - baseline)
            )

            daily.loc[i, "Baseline"] = baseline
            daily.loc[i, "MAD"] = mad

        return daily

    # ---------------------------------------
    # 4. DETECT UNUSUAL SPENDING
    # ---------------------------------------

    def detect_anomalies(self, daily):

        daily = daily.copy()

        daily["Difference"] = (
            daily["Variable_Spending"] -
            daily["Baseline"]
        )

        # Robust estimate of standard deviation
        daily["Scale"] = (
            1.4826 * daily["MAD"]
        )

        # Avoid zero or extremely small variability
        daily["Scale"] = daily["Scale"].clip(
            lower=self.minimum_scale
        )

        daily["Anomaly_Score"] = (
            daily["Difference"] /
            daily["Scale"]
        )

        daily["Classification"] = (
            "Insufficient history"
        )

        valid = daily["Baseline"].notna()

        daily.loc[valid, "Classification"] = "Normal"

        elevated = (
            valid &
            (daily["Anomaly_Score"] >=
             self.elevated_threshold) &
            (daily["Difference"] >=
             self.minimum_difference)
        )

        potential = (
            valid &
            (daily["Anomaly_Score"] >=
             self.potential_threshold) &
            (daily["Difference"] >=
             self.minimum_difference)
        )

        significant = (
            valid &
            (daily["Anomaly_Score"] >=
             self.significant_threshold) &
            (daily["Difference"] >=
             self.minimum_difference)
        )

        daily.loc[
            elevated,
            "Classification"
        ] = "Elevated"

        daily.loc[
            potential,
            "Classification"
        ] = "Potential overspending"

        daily.loc[
            significant,
            "Classification"
        ] = "Significant overspending"

        return daily

    # ---------------------------------------
    # 5. EXPLAIN ANOMALIES
    # ---------------------------------------

    def explain_anomalies(self, daily, transactions):

        anomalies = daily[
            daily["Classification"].isin([
                "Elevated",
                "Potential overspending",
                "Significant overspending"
            ])
        ].copy()

        explanations = []

        for _, row in anomalies.iterrows():

            day_transactions = transactions[
                transactions["Transaction_Date"] ==
                row["Date"]
            ]

            # Largest variable transaction
            largest = day_transactions[
                day_transactions["Variable_Spending"] > 0
            ].sort_values(
                "Variable_Spending",
                ascending=False
            ).head(1)

            if not largest.empty:

                merchant = largest.iloc[0]["Description"]

            else:

                merchant = "Unknown"

            explanations.append({
                "Date": row["Date"],
                "Classification": row["Classification"],
                "Actual_Spending": round(
                    row["Variable_Spending"], 2
                ),
                "Expected_Spending": round(
                    row["Baseline"], 2
                ),
                "Difference": round(
                    row["Difference"], 2
                ),
                "Anomaly_Score": round(
                    row["Anomaly_Score"], 2
                ),
                "Largest_Transaction": merchant
            })

        return pd.DataFrame(explanations)

    # ---------------------------------------
    # 6. VISUALISE RESULTS
    # ---------------------------------------

    def plot_results(self, daily):

        plt.figure(figsize=(15, 7))

        plt.plot(
            daily["Date"],
            daily["Variable_Spending"],
            label="Actual variable spending",
            color="blue"
        )

        plt.plot(
            daily["Date"],
            daily["Baseline"],
            label="Expected spending",
            color="green",
            linewidth=2
        )

        anomalies = daily[
            daily["Classification"].isin([
                "Elevated",
                "Potential overspending",
                "Significant overspending"
            ])
        ]

        plt.scatter(
            anomalies["Date"],
            anomalies["Variable_Spending"],
            color="red",
            label="Spending anomalies",
            zorder=5
        )

        plt.title("Personalised Spending Baseline")

        plt.xlabel("Date")
        plt.ylabel("Daily spending (£)")

        plt.legend()
        plt.grid(alpha=0.3)

        plt.tight_layout()

        plt.savefig("spending_analysis.png")

        plt.show()

    # ---------------------------------------
    # 7. RUN MODEL
    # ---------------------------------------

    def run(self, filepath):

        print("\nLoading bank statement...")

        transactions = self.load_data(filepath)

        print("Aggregating transactions...")

        daily = self.aggregate_daily_spending(
            transactions
        )

        print("Calculating personalised baseline...")

        daily = self.calculate_baseline(daily)

        print("Detecting spending anomalies...")

        results = self.detect_anomalies(daily)

        print("Generating explanations...")

        explanations = self.explain_anomalies(
            results,
            transactions
        )

        # Save outputs
        transactions.to_csv(
            "cleaned_transactions.csv",
            index=False
        )

        results.to_csv(
            "daily_spending_analysis.csv",
            index=False
        )

        explanations.to_csv(
            "spending_anomalies.csv",
            index=False
        )

        print("\nMODEL RESULTS")
        print("=" * 60)

        print(
            "Total spending: £",
            round(transactions["Spending"].sum(), 2)
        )

        print(
            "Variable spending: £",
            round(
                transactions["Variable_Spending"].sum(),
                2
            )
        )

        print(
            "Income: £",
            round(transactions["Income"].sum(), 2)
        )

        print("\nDETECTED ANOMALIES")

        if explanations.empty:

            print("No unusual spending detected.")

        else:

            print(
                explanations.to_string(index=False)
            )

        self.plot_results(results)

        return results


# ---------------------------------------
# MAIN
# ---------------------------------------

if __name__ == "__main__":

    detector = SpendingAnomalyDetector()

    results = detector.run("statement.csv")
