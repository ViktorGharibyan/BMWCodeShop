FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY BmwCodes.BookingApi.csproj NuGet.Config ./
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /out --no-restore /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /out .
ENV ASPNETCORE_ENVIRONMENT=Production
USER $APP_UID
ENTRYPOINT ["dotnet", "BmwCodes.BookingApi.dll"]
