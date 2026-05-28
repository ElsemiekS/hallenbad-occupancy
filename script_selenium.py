from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options

import time
import csv

def get_people_count():
    try:
        # Initialize the web driver in headless mode
        options = Options()
        options.add_argument("--headless=new")
        driver = webdriver.Chrome(options=options)

#        url = "https://www.stadt-zuerich.ch/content/ssd/de/index/sport/schwimmen/hallenbaeder/hallenbad_city.html"
        url = "https://www.stadt-zuerich.ch/de/stadtleben/sport-und-erholung/sport-und-badeanlagen/hallenbaeder/city.html"

        driver.get(url)

        # Wait for the page to load
        time.sleep(5)

        # Find the element containing the number of people in the pool
        people_count = driver.find_element(By.ID, 'SSD-4').text

        driver.quit()

        return people_count
    except Exception as e:
        print(f"An error occurred: {str(e)}")
        return None

def write_to_csv(people_count):
    if people_count is not None:
        with open('people_count_2025.csv', 'a', newline='') as file:
            writer = csv.writer(file)
            writer.writerow([time.ctime(), people_count])

while True:
    # Get the current time
    current_time = time.time()

    # Calculate the time remaining until the next minute
    time_remaining = 60 - (current_time % 60)

    # Sleep until the next minute
    time.sleep(time_remaining)

    # Get the people count
    people_count = get_people_count()

    # Write to CSV
    write_to_csv(people_count)