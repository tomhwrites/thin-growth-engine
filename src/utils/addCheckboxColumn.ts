import { JWT } from "google-auth-library";
import { sheets_v4, drive_v3 } from "googleapis";

type CheckboxColumnConfig = {
  spreadsheetName: string;
  worksheetName: string;
  newColumnName: string;
  placement: "end" | "start" | "after_column";
  columnLetter?: string;
};

function throwError(message: string): never {
  console.log(
    `Checking environment: ${message} =`,
    process.env[message.toUpperCase()]
  );
  throw new Error(`Environment variable ${message} is missing`);
}

const DEFAULT_CONFIG: CheckboxColumnConfig = {
  spreadsheetName: "[Growth] Inner Circle Engagement Tracker",
  worksheetName: "ScriptAuto",
  newColumnName: "",
  placement: "after_column",
  columnLetter: "C",
};

const ROBBIE_CONFIG: CheckboxColumnConfig = {
  spreadsheetName: "[Growth] Inner Circle Engagement Tracker",
  worksheetName: "RobbieScriptAuto",
  newColumnName: "",
  placement: "after_column",
  columnLetter: "C",
};

export const normalizedPrivateKey = (
  process.env.PRIVATE_KEY ?? throwError("PRIVATE_KEY")
).replace(/\\n/g, "\n");

export const credentials = {
  type: process.env.TYPE ?? throwError("TYPE"),
  project_id: process.env.PROJECT_ID ?? throwError("PROJECT_ID"),
  private_key_id: process.env.PRIVATE_KEY_ID ?? throwError("PRIVATE_KEY_ID"),
  private_key: normalizedPrivateKey,
  client_email:
    process.env.GOOGLE_CLIENT_EMAIL ?? throwError("GOOGLE_CLIENT_EMAIL"),
  client_id: process.env.GOOGLE_CLIENT_ID ?? throwError("GOOGLE_CLIENT_ID"),
  auth_uri: process.env.AUTH_URI ?? throwError("AUTH_URI"),
  token_uri: process.env.TOKEN_URI ?? throwError("TOKEN_URI"),
  auth_provider_x509_cert_url:
    process.env.AUTH_PROVIDER_X509_CERT_URL ??
    throwError("AUTH_PROVIDER_X509_CERT_URL"),
  client_x509_cert_url:
    process.env.CLIENT_X509_CERT_URL ?? throwError("CLIENT_X509_CERT_URL"),
  universe_domain: process.env.UNIVERSE_DOMAIN ?? throwError("UNIVERSE_DOMAIN"),
};

export async function addCheckboxColumn(
  checkedRows: number[],
  tweetUrl: string,
  isRobbie: boolean,
  postDate: Date
): Promise<void> {
  let finalConfig: CheckboxColumnConfig;

  if (isRobbie) {
    finalConfig = { ...ROBBIE_CONFIG };
  } else {
    finalConfig = { ...DEFAULT_CONFIG };
  }

  try {
    const auth = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
      ],
    });

    const drive = new drive_v3.Drive({ auth });
    const sheets = new sheets_v4.Sheets({ auth });

    // Get spreadsheet ID
    const fileList = await drive.files.list({
      q: `name='${finalConfig.spreadsheetName}' and mimeType='application/vnd.google-apps.spreadsheet'`,
      fields: "files(id)",
      spaces: "drive",
    });

    if (!fileList.data.files?.length) {
      throw new Error(`Spreadsheet '${finalConfig.spreadsheetName}' not found`);
    }

    const spreadsheetId = fileList.data.files[0].id;
    if (!spreadsheetId) {
      throw new Error("Failed to get spreadsheet ID");
    }

    // Get worksheet metadata without loading all cells
    const sheetsResponse = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties",
    });

    if (
      !sheetsResponse.data.sheets ||
      sheetsResponse.data.sheets.length === 0
    ) {
      throw new Error("No worksheets found in the spreadsheet");
    }

    // Find the target worksheet
    const worksheetProperties = sheetsResponse.data.sheets.find(
      (sheet) => sheet.properties?.title === finalConfig.worksheetName
    )?.properties;

    if (!worksheetProperties) {
      throw new Error(`Worksheet '${finalConfig.worksheetName}' not found`);
    }

    const sheetId = worksheetProperties.sheetId;

    // Determine column index based on placement
    let columnIndex: number;
    if (finalConfig.placement === "end") {
      // Get the number of columns in the sheet
      const dimensionsResponse = await sheets.spreadsheets.get({
        spreadsheetId,
        ranges: [finalConfig.worksheetName],
        fields: "sheets.properties.gridProperties",
      });

      const gridProps =
        dimensionsResponse.data.sheets?.[0].properties?.gridProperties;
      columnIndex = gridProps?.columnCount || 1;
    } else if (finalConfig.placement === "start") {
      columnIndex = 0; // 0-indexed in the API
    } else if (
      finalConfig.placement === "after_column" &&
      finalConfig.columnLetter
    ) {
      columnIndex =
        finalConfig.columnLetter.toUpperCase().charCodeAt(0) -
        "A".charCodeAt(0) +
        1; // Convert to 0-indexed
    } else {
      throw new Error("Invalid placement option or missing column letter");
    }

    // Insert a new column
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            insertDimension: {
              range: {
                sheetId,
                dimension: "COLUMNS",
                startIndex: columnIndex,
                endIndex: columnIndex + 1,
              },
            },
          },
        ],
      },
    });

    // Format the date
    const formattedDate = postDate.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });

    // Create a batch update for header, date, and URL cells
    const columnLetter = String.fromCharCode(65 + columnIndex); // Convert index to letter (A, B, C...)

    // Prepare values for the header, date, and URL
    const headerValues = [
      [finalConfig.newColumnName], // Header (row 1)
      [formattedDate], // Date (row 2)
      [tweetUrl], // URL (row 3)
    ];

    // Update the header, date, and URL in a single batch
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${finalConfig.worksheetName}!${columnLetter}1:${columnLetter}3`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: headerValues,
      },
    });

    // Set data validation for the column (checkboxes)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            setDataValidation: {
              range: {
                sheetId,
                startRowIndex: 3,
                endRowIndex:
                  worksheetProperties.gridProperties?.rowCount || 1000,
                startColumnIndex: columnIndex,
                endColumnIndex: columnIndex + 1,
              },
              rule: {
                condition: {
                  type: "BOOLEAN",
                },
                strict: true,
              },
            },
          },
        ],
      },
    });

    // If there are rows to check, update them in a single batch
    if (checkedRows.length > 0) {
      // Filter valid rows
      const validRows = checkedRows.filter(
        (row) =>
          row >= 4 &&
          row <= (worksheetProperties.gridProperties?.rowCount || 1000)
      );

      if (validRows.length > 0) {
        // Create a sparse update for checked cells
        const requests = validRows.map((row) => ({
          updateCells: {
            rows: [
              {
                values: [
                  {
                    userEnteredValue: {
                      boolValue: true,
                    },
                  },
                ],
              },
            ],
            fields: "userEnteredValue",
            start: {
              sheetId,
              rowIndex: row - 1, // Convert to 0-indexed
              columnIndex: columnIndex,
            },
          },
        }));

        // Perform the batch update
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests,
          },
        });

        console.log(
          `Added checkbox column '${finalConfig.newColumnName}' to worksheet '${finalConfig.worksheetName}' with ${validRows.length} rows checked`
        );
      }
    }
  } catch (error) {
    console.error(
      "An error occurred:",
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}
