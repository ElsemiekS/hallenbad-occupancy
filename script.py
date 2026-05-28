import requests
from bs4 import BeautifulSoup
import pandas as pd
import time
import csv

def get_people_count():
    url = "https://www.stadt-zuerich.ch/content/ssd/de/index/sport/schwimmen/hallenbaeder/hallenbad_city.html"
    response = requests.get(url)
    soup = BeautifulSoup(response.text, 'html.parser')
    
    # Save the soup to a file
    with open('soup.txt', 'w', encoding='utf-8') as file:
        file.write(str(soup))

    # Find the element containing the number of people in the pool
    people_count = soup.find('td', attrs={'id': 'SSD-4'}).text

    return people_count

def write_to_csv(people_count):
    with open('people_count.csv', 'a', newline='') as file:
        writer = csv.writer(file)
        writer.writerow([time.ctime(), people_count])

while True:
    people_count = get_people_count()
    print(people_count)
    #write_to_csv(people_count)
    time.sleep(60)  # Wait for 60 seconds