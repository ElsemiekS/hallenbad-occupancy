import pandas as pd
import matplotlib.pyplot as plt

# Import the csv into a dataframe
df = pd.read_csv('people_count.csv', header=None, names=['Timestamp', 'People'])

# Convert the 'Timestamp' column to datetime
df['Timestamp'] = pd.to_datetime(df['Timestamp'])

# Convert the 'People' column to numeric
df['People'] = pd.to_numeric(df['People'], errors='coerce')

# Set 'Timestamp' as the index
df.set_index('Timestamp', inplace=True)

# Resample the data at a 10-minute frequency and interpolate missing values
df = df.resample('10T').first().ffill(limit=1)

# Create a line plot
plt.figure(figsize=(10,6))
plt.plot(df['People'], color='blue', linewidth=2)
plt.scatter(df.index, df['People'])

# Set the title and labels
plt.title('Number of People in the Pool Over Time')
plt.xlabel('Timestamp')
plt.ylabel('Number of People')

# Save the plot as a png file
plt.savefig('people_in_pool.png')

# Show the plot
plt.show()