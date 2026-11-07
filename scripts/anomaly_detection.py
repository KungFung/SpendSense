import pandas as pd
import numpy as np
import matplotlib.pyplot as plt


class SpendingAnomalyDetector:

    def __init__(
        self,
        elevated_threshold=1.5,
        potential_threshold=2.5,
        significant_threshold=3.5,
        minimum_difference=10
    ):

        self.elevated_threshold = elevated_threshold
        self.potential_threshold = potential_threshold
        self.significant_threshold = significant_threshold
        self.minimum_difference = minimum_difference

    def load_data(self, filepath):

        df = pd.read_csv(filepath)

        df["date"] = pd.to_datetime(df["date"])

        df["amount"] = pd.to_numeric(
            df["amount"],
            errors="raise"
        )

        if df["amount"].isna().any():
            raise ValueError("Missing spending amounts.")

        if (df["amount"] < 0).any():
            raise ValueError("Spending amounts cannot be negative.")

        # Aggregate transactions into daily spending
        daily = (
            df.groupby("date")["amount"]
            .sum()
            .reset_index()
        )

        # Include days with no spending
        daily = daily.set_index("date")

        daily = daily.asfreq("D", fill_value=0)

        daily.index.name = "date"

        daily = daily.reset_index()

        daily["day_of_week"] = daily["date"].dt.dayofweek

        return daily

    def calculate_baseline(self, daily):

        daily = daily.copy()

        daily["baseline"] = np.nan
        daily["mad"] = np.nan

        for index, row in daily.iterrows():

            # Only use historical observations
            history = daily[
                (daily["date"] < row["date"]) &
                (daily["day_of_week"] == row["day_of_week"])
            ]["amount"]

            if len(history) < 4:
                # Fallback to all historical observations
                history = daily[
                    daily["date"] < row["date"]
                ]["amount"]

            if len(history) < 7:
                continue

            median = history.median()

            mad = np.median(
                np.abs(history - median)
            )

            daily.loc[index, "baseline"] = median
            daily.loc[index, "mad"] = mad

        return daily

    def detect_anomalies(self, daily):

        daily = daily.copy()

        daily["difference"] = (
            daily["amount"] - daily["baseline"]
        )

        # Robust standard deviation estimate
        daily["robust_std"] = 1.4826 * daily["mad"]

        # Avoid division by zero
        daily["robust_std"] = daily["robust_std"].replace(
            0, np.nan
        )

        daily["anomaly_score"] = (
            daily["difference"] / daily["robust_std"]
        )

        daily["classification"] = "Insufficient history"

        valid = daily["baseline"].notna()

        daily.loc[valid, "classification"] = "Normal"

        elevated = (
            valid &
            (daily["anomaly_score"] >= self.elevated_threshold) &
            (daily["difference"] >= self.minimum_difference)
        )

        potential = (
            valid &
            (daily["anomaly_score"] >= self.potential_threshold) &
            (daily["difference"] >= self.minimum_difference)
        )

        significant = (
            valid &
            (daily["anomaly_score"] >= self.significant_threshold) &
            (daily["difference"] >= self.minimum_difference)
        )

        daily.loc[elevated, "classification"] = "Elevated"

        daily.loc[potential, "classification"] = (
            "Potential overspending"
        )

        daily.loc[significant, "classification"] = (
            "Significant overspending"
        )

        return daily

    def plot_results(self, daily):

        plt.figure(figsize=(15, 7))

        plt.plot(
            daily["date"],
            daily["amount"],
            label="Actual spending",
            color="blue"
        )

        plt.plot(
            daily["date"],
            daily["baseline"],
            label="Expected spending",
            color="green",
            linewidth=2
        )

        anomalies = daily[
            daily["classification"].isin([
                "Elevated",
                "Potential overspending",
                "Significant overspending"
            ])
        ]

        plt.scatter(
            anomalies["date"],
            anomalies["amount"],
            color="red",
            label="Spending anomalies",
            zorder=5
        )

        plt.title("Personalised Spending Anomaly Detection")

        plt.xlabel("Date")
        plt.ylabel("Daily spending (£)")

        plt.legend()
        plt.grid(alpha=0.3)

        plt.tight_layout()
        plt.show()

    def run(self, filepath):

        daily = self.load_data(filepath)

        daily = self.calculate_baseline(daily)

        results = self.detect_anomalies(daily)

        results.to_csv(
            "spending_anomaly_results.csv",
            index=False
        )

        print("\nSPENDING ANOMALIES")
        print("=" * 60)

        anomalies = results[
            results["classification"].isin([
                "Elevated",
                "Potential overspending",
                "Significant overspending"
            ])
        ]

        if anomalies.empty:
            print("No unusual spending detected.")

        else:
            print(
                anomalies[
                    [
                        "date",
                        "amount",
                        "baseline",
                        "anomaly_score",
                        "classification"
                    ]
                ].to_string(index=False)
            )

        self.plot_results(results)

        return results


if __name__ == "__main__":

    detector = SpendingAnomalyDetector()

    results = detector.run("spending.csv")
