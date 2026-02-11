my paper webstore works the following the way



i created index.html code file. this is the master file. it has all the info all the coding and everything. most important file is this.

the index.html file has this important following part


**const SPREADSHEET\_ID = "1-KuOU3Kj4Yo6afuGN5qENwAlGvGUORQSz8qfcNCqv18"**

**const API\_KEY = "AIzaSyA05kFZ9ejXco6wpLFfV8WUVaUBbjnhhVI"**

**const SHEET\_NAME = "Sheet1**
this is how the index.html and google sheet is linked.


the index.html file has two scripts in it related to google. 

**fetch('https://script.google.com/macros/s/AKfycbw-h33gLXwPGRdnlURFncIhf3W8AS55ikyJN8Db4IZaydA4BwXxyG4gkSghUlluOznFWg/exec', {**

            **method: 'POST',**

            **mode: 'no-cors',**

            **headers: { 'Content-Type': 'application/json' },**

            **body: JSON.stringify(emailData)**

        **}).catch(err => console.error('Email Backup Error:', err));**

this script sends the email copy of the order to Abdullah.maverick, from where it is autosent to msgtllc.com

**// Function to save order to Google Sheets**

**async function saveOrderToGoogleSheets(orderData) {**

    **const scriptUrl = 'https://script.google.com/macros/s/AKfycbysHbzMzacuCiZp16PJO5Gnx8kN2asM2Te4yDavvSdXRUN2jfUwRvc-LCjRvKPGXbsG/exec';**

    
this script i recently added that is also placed in order.html file. this script pastes the order data in google sheet, which is used to sync the tracking system.



then there is google sheets. it has all the products details. it has two scripts running it. Code.gs and updatestock.gs.

Code.gs link the index.html file and the google sheets products file.

the updatestock.gs file accepts the data from offline software and it receives the pushed stock and updates the google sheet stock so that it becomes available or not by changing yes and no autuomatically in the sheet. the updatestock.gs file is present the folder which has the files which pushes the data from software to excel to google sheets. i am also putting all the files here as well for ease.

i am putting all the file in google drive in a proper way.









